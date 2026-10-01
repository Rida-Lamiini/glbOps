"""Local backups of the standalone (SQLite) app: the database + every uploaded file, in one zip.

``create_backup`` snapshots the live database with SQLite's online backup API, so it is safe while
the app is running. A restore cannot swap the database under a running server: ``stage_restore``
queues the chosen backup and ``apply_pending_restore`` (run by the launcher before Django starts)
puts it in place on the next start. The previous state is itself backed up first.
In online mode (shared Postgres) backups belong to the database provider, not to this module.
"""

import json
import os
import shutil
import sqlite3
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

DB_NAME = "carte.sqlite3"
PENDING = "restore_pending.zip"
KEEP_DEFAULT = 14


class BackupError(Exception):
    pass


def backup_dir(data_dir) -> Path:
    path = Path(data_dir) / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_name(name: str) -> str:
    if not name or "/" in name or "\\" in name or ".." in name or not name.endswith(".zip"):
        raise BackupError("Nom de sauvegarde invalide.")
    return name


def create_backup(data_dir, version="", reason="manuelle", keep=KEEP_DEFAULT) -> dict:
    data_dir = Path(data_dir)
    db_path = data_dir / DB_NAME
    if not db_path.is_file():
        raise BackupError("Aucune base locale à sauvegarder.")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = backup_dir(data_dir) / f"carte-{stamp}-{reason}.zip"
    with tempfile.TemporaryDirectory() as tmp:
        snapshot = Path(tmp) / DB_NAME
        src = sqlite3.connect(db_path, timeout=30)
        dst = sqlite3.connect(snapshot)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        files = 0
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(snapshot, DB_NAME)
            media = data_dir / "media"
            if media.is_dir():
                for file in media.rglob("*"):
                    if file.is_file():
                        zf.write(file, "media/" + file.relative_to(media).as_posix())
                        files += 1
            zf.writestr(
                "backup.json",
                json.dumps({"created": datetime.now(timezone.utc).isoformat(timespec="seconds"), "version": version, "reason": reason, "files": files}),
            )
    prune(data_dir, keep)
    return describe(target)


def describe(path: Path) -> dict:
    stat = path.stat()
    return {
        "name": path.name,
        "size": stat.st_size,
        "created": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(timespec="seconds"),
    }


def list_backups(data_dir) -> list[dict]:
    folder = backup_dir(data_dir)
    items = [describe(p) for p in folder.glob("carte-*.zip")]
    return sorted(items, key=lambda b: b["created"], reverse=True)


def prune(data_dir, keep=KEEP_DEFAULT) -> None:
    """Keeps the newest ``keep`` automatic/manual backups; pre-restore safety copies are never pruned here."""
    autos = [p for p in backup_dir(data_dir).glob("carte-*.zip") if "avant-restauration" not in p.name]
    autos.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for old in autos[keep:]:
        old.unlink(missing_ok=True)


def newest_age_hours(data_dir):
    items = list_backups(data_dir)
    if not items:
        return None
    newest = datetime.fromisoformat(items[0]["created"])
    return (datetime.now(timezone.utc) - newest).total_seconds() / 3600


def maybe_backup(data_dir, version="", every_hours=24, keep=KEEP_DEFAULT):
    """Creates an automatic backup when the newest one is older than ``every_hours``. Returns it or None."""
    age = newest_age_hours(data_dir)
    if age is not None and age < every_hours:
        return None
    if not (Path(data_dir) / DB_NAME).is_file():
        return None
    return create_backup(data_dir, version=version, reason="auto", keep=keep)


def stage_restore(data_dir, name: str, version="") -> None:
    """Queues a restore for the next start (and backs up the current state first)."""
    data_dir = Path(data_dir)
    source = backup_dir(data_dir) / _safe_name(name)
    if not source.is_file():
        raise BackupError("Sauvegarde introuvable.")
    with zipfile.ZipFile(source) as zf:
        if DB_NAME not in zf.namelist():
            raise BackupError("Cette sauvegarde n'est pas valide (base absente).")
    create_backup(data_dir, version=version, reason="avant-restauration")
    shutil.copyfile(source, data_dir / PENDING)


def apply_pending_restore(data_dir) -> bool:
    """Run before the app opens the database: swaps in the queued backup. Returns True if one was applied."""
    data_dir = Path(data_dir)
    pending = data_dir / PENDING
    if not pending.is_file():
        return False
    with zipfile.ZipFile(pending) as zf:
        names = zf.namelist()
        if DB_NAME not in names:
            pending.unlink()
            return False
        for suffix in ("", "-wal", "-shm"):
            (data_dir / (DB_NAME + suffix)).unlink(missing_ok=True)
        with zf.open(DB_NAME) as src, open(data_dir / DB_NAME, "wb") as dst:
            shutil.copyfileobj(src, dst)
        media = data_dir / "media"
        if media.is_dir():
            shutil.rmtree(media)
        for name in names:
            if not name.startswith("media/") or name.endswith("/"):
                continue
            rel = name[len("media/"):]
            if ".." in rel.split("/"):
                continue
            target = media / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
    pending.unlink()
    return True


def run_scheduler(data_dir, version, every_hours=24, keep=KEEP_DEFAULT, check_minutes=30, log=lambda text: None):
    """Blocking loop for a background thread: backs up when due, checking every ``check_minutes``."""
    while True:
        try:
            made = maybe_backup(data_dir, version=version, every_hours=every_hours, keep=keep)
            if made:
                log(f"Sauvegarde automatique : {made['name']}")
        except Exception as exc:  # noqa: BLE001 - a failed backup must never take the app down
            log(f"Sauvegarde automatique échouée : {exc}")
        time.sleep(check_minutes * 60)
