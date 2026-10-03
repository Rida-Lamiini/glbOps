"""Writes dist-installer/latest.json for the in-app update check.

Usage: python launcher/make_release_manifest.py <installer.exe> <public-url-of-the-installer> [notes]
Upload both the installer and latest.json to the host that CARTE_UPDATE_URL points at.
"""

import hashlib
import json
import sys
from pathlib import Path

installer = Path(sys.argv[1])
url = sys.argv[2]
notes = sys.argv[3] if len(sys.argv) > 3 else ""
version = (Path(__file__).resolve().parent.parent / "VERSION").read_text(encoding="utf-8").strip()

digest = hashlib.sha256()
with open(installer, "rb") as fh:
    for chunk in iter(lambda: fh.read(1 << 20), b""):
        digest.update(chunk)

manifest = {"version": version, "url": url, "sha256": digest.hexdigest(), "size": installer.stat().st_size, "notes": notes}
out = installer.parent / "latest.json"
out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"{out}\n{json.dumps(manifest, ensure_ascii=False)}")
