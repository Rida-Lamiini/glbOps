"""The app version: one line in the VERSION file (repo root, or next to the code inside the .exe)."""

from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def app_version() -> str:
    here = Path(__file__).resolve().parent.parent  # backend/ (or the PyInstaller bundle root)
    for candidate in (here / "VERSION", here.parent / "VERSION"):
        try:
            return candidate.read_text(encoding="utf-8").strip() or "0.0.0"
        except OSError:
            continue
    return "0.0.0"
