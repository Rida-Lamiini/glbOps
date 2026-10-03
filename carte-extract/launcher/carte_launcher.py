"""Entry point of the Carte desktop app (Windows .exe).

Starts the Django API + the built frontend on 127.0.0.1 (SQLite in %LOCALAPPDATA%\\CarteExtract, or the
shared online Postgres when a carte.env is present) and shows it in a native window (Edge WebView2).
Closing the window stops the app. Falls back to the default browser if no native window is available.
"""

import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
DATA_DIR = Path(os.environ.get("CARTE_DATA_DIR") or Path(os.environ.get("LOCALAPPDATA", Path.home())) / "CarteExtract")
PORT = int(os.environ.get("CARTE_PORT", "8765"))
TITLE = "Carte — Globétudes"

LOADING_HTML = """<!doctype html><meta charset="utf-8"><title>Carte</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#f4efe4;color:#1d1b18;font-family:Georgia,serif">
<div style="text-align:center"><div style="font-size:30px;letter-spacing:.02em">Carte</div>
<div style="margin-top:10px;font:14px Segoe UI,sans-serif;color:#7a7266">%s</div></div></body>"""


def say(text):
    """Console output (there is none in the windowed build) plus a log file in the data folder."""
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(DATA_DIR / "carte.log", "a", encoding="utf-8") as fh:
            fh.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {text}\n")
    except OSError:
        pass
    if sys.stdout:
        try:
            print(text, flush=True)
        except Exception:  # noqa: BLE001
            pass


def healthy(port, timeout=1.5):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health/", timeout=timeout) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def free_port(preferred):
    for port in (preferred, 0):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return s.getsockname()[1]
            except OSError:
                continue
    raise RuntimeError("Aucun port libre")


def online_env_file():
    """carte.env (DATABASE_URL=...) next to the .exe or in the data folder switches to the shared online database."""
    exe_dir = Path(sys.executable).parent if FROZEN else Path(__file__).resolve().parent
    for folder in (exe_dir, DATA_DIR):
        candidate = folder / "carte.env"
        if candidate.is_file():
            return candidate
    return None


def restart_app():
    """Starts a fresh copy of the app and exits this one (used after a restore). Onefile builds must not
    inherit PyInstaller's private variables, or the new copy would reuse this one's soon-deleted temp folder."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("_PYI") and k != "_MEIPASS2"}
    env["CARTE_RESTARTED"] = "1"
    cmd = [sys.executable] if FROZEN else [sys.executable, str(Path(__file__).resolve())]
    subprocess.Popen(cmd, env=env, close_fds=True)
    os._exit(0)


def start_server(port, status):
    """Prepares the database and serves the app. Runs in a background thread; `status` is called with progress text."""
    online = online_env_file()
    if online:
        os.environ["CARTE_ENV_FILE"] = str(online)
    key_file = DATA_DIR / "secret.key"
    if not key_file.exists():
        key_file.write_text(secrets.token_urlsafe(50))
    os.environ.update(
        CARTE_DB="sqlite",
        CARTE_DATA_DIR=str(DATA_DIR),
        CARTE_SERVE_FRONTEND="1",
        CARTE_FRONTEND_DIST=str(BASE / "frontend_dist"),
        DJANGO_DEBUG="False",
        DJANGO_SECRET_KEY=key_file.read_text().strip(),
        DJANGO_SETTINGS_MODULE="config.settings",
    )
    sys.path.insert(0, str(BASE / "backend") if (BASE / "backend").is_dir() else str(BASE))

    if not online:
        # A restore chosen in the app is applied here, before the database is opened.
        from core.backups import apply_pending_restore

        if apply_pending_restore(DATA_DIR):
            say("Sauvegarde restaurée.")
            (DATA_DIR / ".seeded").write_text("ok")

    import django

    django.setup()
    from django.core.management import call_command

    status("Préparation de la base de données…")
    call_command("migrate", verbosity=0, interactive=False)

    seeded = DATA_DIR / ".seeded"
    seed = BASE / "seed_bundle.zip"
    if online:
        say("Mode en ligne : base de données partagée.")
    elif not seeded.exists() and seed.is_file():
        status("Premier lancement : chargement des données (clients, projets, lots, plans)…")
        from core.bundle import import_bundle

        import_bundle(seed)
        seeded.write_text("ok")

    from core import runtime
    from core.version import app_version

    runtime.restart_callback = restart_app
    runtime.exit_callback = lambda: os._exit(0)
    say(f"Carte {app_version()} — {'mode en ligne' if online else 'mode local'}")
    if not online:
        from core.backups import run_scheduler

        # Daily automatic backup (database + uploaded files) while the app is open; the 14 newest are kept.
        threading.Thread(
            target=run_scheduler,
            args=(DATA_DIR, app_version()),
            kwargs={"every_hours": float(os.environ.get("CARTE_BACKUP_HOURS", "24")), "log": say},
            daemon=True,
        ).start()

    from config.wsgi import application
    from waitress import serve

    serve(application, host="127.0.0.1", port=port, threads=8, _quiet=True)


def open_window(url_getter, set_status_hook):
    """Native window; returns False when none is available (caller falls back to the browser)."""
    try:
        import webview
    except Exception:  # noqa: BLE001
        say("pywebview indisponible : ouverture dans le navigateur.")
        return False

    window = webview.create_window(TITLE, html=LOADING_HTML % "Démarrage…", width=1440, height=900, min_size=(900, 600))
    set_status_hook(lambda text: window.load_html(LOADING_HTML % text))

    def navigate():
        url = url_getter()  # blocks until the server answers
        if url:
            window.load_url(url)
        else:
            window.load_html(LOADING_HTML % "Le démarrage a échoué. Voir carte.log dans le dossier de données.")

    webview.settings["ALLOW_DOWNLOADS"] = True
    try:
        (DATA_DIR / "webview").mkdir(parents=True, exist_ok=True)
        webview.start(navigate, private_mode=False, storage_path=str(DATA_DIR / "webview"))
        return True
    except Exception:  # noqa: BLE001
        say("Fenêtre native indisponible (WebView2 ?) :\n" + traceback.format_exc())
        return False


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if os.environ.get("CARTE_RESTARTED"):  # let the previous copy release the port first
        for _ in range(40):
            if not healthy(PORT, timeout=0.5):
                break
            time.sleep(0.5)
    state = {"url": None, "error": None, "status": lambda text: say(text)}

    if healthy(PORT):  # another instance is already serving: just show it
        state["url"] = f"http://127.0.0.1:{PORT}"
    else:
        port = free_port(PORT)

        def run():
            try:
                start_server(port, lambda text: (say(text), state["status"](text)))
            except Exception:  # noqa: BLE001
                state["error"] = traceback.format_exc()
                say("Erreur au démarrage :\n" + state["error"])

        threading.Thread(target=run, daemon=True).start()

        def wait_url():
            for _ in range(600):  # up to ~5 minutes (first launch loads the data)
                if state["error"]:
                    return None
                if healthy(port, timeout=1):
                    state["url"] = f"http://127.0.0.1:{port}"
                    return state["url"]
                time.sleep(0.5)
            return None

        state["wait"] = wait_url

    def url_getter():
        return state["url"] or state["wait"]()

    def set_hook(fn):
        state["status"] = lambda text: (say(text), fn(text))

    if not open_window(url_getter, set_hook):
        url = url_getter()
        if url:
            webbrowser.open(url)
            say(f"Carte est prête : {url} — fermez cette fenêtre pour arrêter.")
            while not state["error"]:
                time.sleep(1)
    os._exit(0)  # closing the window ends the app (and its server thread)


if __name__ == "__main__":
    main()
