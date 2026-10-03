"""Self-update of the desktop app.

The app reads a small ``latest.json`` from a web address you control::

    {"version": "1.2.0", "url": "https://.../CarteGlobetudes-Setup-1.2.0.exe",
     "sha256": "<hex>", "size": 80000000, "notes": "What's new"}

If ``version`` is newer than the running one, the UI offers the update; installing downloads the
installer, checks its SHA-256, runs it silently (it closes this app, replaces the program, relaunches)
and exits. Users' data lives outside the program folder and is untouched.
The address comes from ``CARTE_UPDATE_URL`` (environment / carte.env), a file ``update.url`` in the data
folder, or ``update_url.txt`` baked into the build (see launcher/build_release.sh). No address = no check.
https is required (plain http only for localhost, for testing).
"""

import hashlib
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from django.conf import settings

from . import runtime
from .version import app_version

CHECK_TIMEOUT = 8
CACHE_SECONDS = 3600

_lock = threading.Lock()
_cache = {"at": 0.0, "value": None}
_install = {"state": "idle", "percent": 0, "error": ""}


def parse_version(text: str) -> tuple:
    parts = []
    for piece in str(text).strip().lstrip("vV").split(".")[:4]:
        digits = "".join(ch for ch in piece if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts + [0] * (4 - len(parts)))


def is_newer(candidate: str, current: str) -> bool:
    return parse_version(candidate) > parse_version(current)


def _allowed(url: str) -> bool:
    u = urlparse(url)
    return u.scheme == "https" or (u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1"))


def update_url() -> str:
    url = os.environ.get("CARTE_UPDATE_URL", "").strip()
    if url:
        return url
    here = Path(__file__).resolve().parent.parent
    for candidate in (Path(settings.DATA_DIR) / "update.url", here / "update_url.txt", here.parent / "update_url.txt"):
        try:
            text = candidate.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if text:
            return text
    return ""


def check(force=False) -> dict:
    """{"configured", "available", "current", "latest", "notes", "size", "error"} — never raises."""
    current = app_version()
    url = update_url()
    base = {"configured": bool(url), "available": False, "current": current, "latest": current, "notes": "", "size": 0, "error": ""}
    if not url:
        return base
    with _lock:
        if not force and _cache["value"] and time.time() - _cache["at"] < CACHE_SECONDS:
            return _cache["value"]
    result = dict(base)
    try:
        if not _allowed(url):
            raise ValueError("L'adresse de mise à jour doit être en https.")
        manifest = requests.get(url, timeout=CHECK_TIMEOUT).json()
        latest = str(manifest["version"])
        if not _allowed(str(manifest["url"])) or not manifest.get("sha256"):
            raise ValueError("Manifeste de mise à jour invalide.")
        result.update(
            latest=latest,
            available=is_newer(latest, current),
            notes=str(manifest.get("notes", "")),
            size=int(manifest.get("size") or 0),
            _manifest=manifest,
        )
    except Exception as exc:  # noqa: BLE001 - offline, bad JSON, ...: just no update info
        result["error"] = str(exc)
    with _lock:
        _cache.update(at=time.time(), value=result)
    return result


def public(result: dict) -> dict:
    return {k: v for k, v in result.items() if not k.startswith("_")}


def status() -> dict:
    return dict(_install)


def _launch_installer(target: Path) -> None:
    """Starts the silent installer so that it outlives this process.

    A one-file PyInstaller app runs inside a Windows job that kills its processes when the app exits, so the
    installer must break away from it (and from our console/process group) or it would die with the app."""
    args = [str(target), "/SILENT", "/CLOSEAPPLICATIONS", "/RELAUNCH=1", "/SUPPRESSMSGBOXES", "/NORESTART",
            f"/LOG={Path(settings.DATA_DIR) / 'update-setup.log'}"]
    detached = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    try:
        subprocess.Popen(args, close_fds=True, creationflags=detached | 0x01000000)  # CREATE_BREAKAWAY_FROM_JOB
    except OSError:
        subprocess.Popen(args, close_fds=True, creationflags=detached)  # the job forbids breakaway


def _run_install(manifest: dict) -> None:
    try:
        _install.update(state="downloading", percent=0, error="")
        target = Path(tempfile.mkdtemp(prefix="carte-update-")) / "CarteGlobetudes-Setup.exe"
        digest = hashlib.sha256()
        with requests.get(manifest["url"], stream=True, timeout=(CHECK_TIMEOUT, 60)) as response:
            response.raise_for_status()
            total = int(response.headers.get("Content-Length") or manifest.get("size") or 0)
            done = 0
            with open(target, "wb") as fh:
                for chunk in response.iter_content(1 << 20):
                    fh.write(chunk)
                    digest.update(chunk)
                    done += len(chunk)
                    if total:
                        _install["percent"] = min(99, int(done * 100 / total))
        if digest.hexdigest().lower() != str(manifest["sha256"]).lower():
            target.unlink(missing_ok=True)
            raise ValueError("Le fichier téléchargé est corrompu (somme de contrôle différente) : mise à jour annulée.")
        _install.update(state="installing", percent=100)
        if getattr(sys, "frozen", False):
            # Silent install over the current version; it closes this app and relaunches the new one.
            _launch_installer(target)
            if runtime.exit_callback:
                threading.Timer(1.0, runtime.exit_callback).start()
        else:
            _install.update(state="ready", error=f"Installateur prêt : {target}")  # development: just leave it there
    except Exception as exc:  # noqa: BLE001
        _install.update(state="error", error=str(exc))


def start_install() -> dict:
    """Starts downloading + installing the latest version in the background. Returns the status."""
    result = check(force=True)
    if not result["available"] or "_manifest" not in result:
        _install.update(state="error", error="Aucune mise à jour disponible.")
        return status()
    with _lock:
        if _install["state"] in ("downloading", "installing"):
            return status()
        _install.update(state="downloading", percent=0, error="")
    threading.Thread(target=_run_install, args=(result["_manifest"],), daemon=True).start()
    return status()
