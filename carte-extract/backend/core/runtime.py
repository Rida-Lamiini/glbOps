"""Hooks the desktop launcher fills in so the API can ask the app to restart (after a restore)."""

restart_callback = None  # set by launcher/carte_launcher.py
exit_callback = None  # closes the app (used right after launching the installer of an update)
