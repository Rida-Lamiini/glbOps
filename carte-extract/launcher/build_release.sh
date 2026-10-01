#!/usr/bin/env bash
# Full release: frontend -> exe (version resource) -> optional signature -> installer -> optional signature.
# Signing is skipped unless CARTE_SIGN_PFX (+ CARTE_SIGN_PASSWORD) is set — see launcher/sign.ps1.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(tr -d '[:space:]' < VERSION)
ISCC=${ISCC:-"C:/Users/HP/AppData/Local/Programs/Inno Setup 6/ISCC.exe"}

(cd frontend && npx vite build)
bash launcher/build_exe.sh
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/sign.ps1 dist-build/CarteExtract.exe
MSYS_NO_PATHCONV=1 "$ISCC" "/DAppVersion=$VERSION" launcher/installer.iss
powershell -NoProfile -ExecutionPolicy Bypass -File launcher/sign.ps1 "dist-installer/CarteGlobetudes-Setup-$VERSION.exe"
echo "Done: dist-installer/CarteGlobetudes-Setup-$VERSION.exe"
