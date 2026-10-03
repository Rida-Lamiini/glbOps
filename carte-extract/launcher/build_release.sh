#!/usr/bin/env bash
# Full release: frontend -> exe (version resource) -> optional signature -> installer -> optional signature
# -> latest.json for the in-app update check.
#
# Optional environment:
#   CARTE_SIGN_PFX / CARTE_SIGN_PASSWORD   sign the exe and the installer (launcher/sign.ps1)
#   CARTE_UPDATE_URL     address of latest.json, baked into the app so it checks for updates
#                        (e.g. https://github.com/OWNER/REPO/releases/latest/download/latest.json)
#   CARTE_RELEASE_BASE   address the installer will be uploaded to (folder URL); makes latest.json
#   CARTE_RELEASE_NOTES  one line shown to users in "Mise à jour disponible"
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(tr -d '[:space:]' < VERSION)
ISCC=${ISCC:-"C:/Users/HP/AppData/Local/Programs/Inno Setup 6/ISCC.exe"}
SETUP="dist-installer/CarteGlobetudes-Setup-$VERSION.exe"

printf '%s' "${CARTE_UPDATE_URL:-}" > launcher/update_url.txt   # empty = no automatic check

(cd frontend && npx vite build)
bash launcher/build_exe.sh
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/sign.ps1 dist-build/CarteExtract.exe
MSYS_NO_PATHCONV=1 "$ISCC" "/DAppVersion=$VERSION" launcher/installer.iss
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/sign.ps1 "$SETUP"

if [ -n "${CARTE_RELEASE_BASE:-}" ]; then
  "${PYTHON:-C:/cx-venv/Scripts/python.exe}" launcher/make_release_manifest.py "$SETUP" \
    "${CARTE_RELEASE_BASE%/}/CarteGlobetudes-Setup-$VERSION.exe" "${CARTE_RELEASE_NOTES:-}"
  echo "Upload $SETUP and dist-installer/latest.json to ${CARTE_RELEASE_BASE}"
fi
echo "Done: $SETUP"
