#!/usr/bin/env bash
# Builds dist-build/CarteExtract.exe. Needs: a venv with launcher/requirements-exe.txt installed
# (use a SHORT path such as C:/cx-venv — Windows long paths break pip), a built frontend
# (cd frontend && VITE_API_BASE_URL=/api npm run build) and launcher/seed_bundle.zip
# (cd backend && python manage.py export_bundle ../launcher/seed_bundle.zip, pointed at the glbOps database).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd -W)
PYI=${PYI:-C:/cx-venv/Scripts/pyinstaller.exe}
# PyInstaller's submodule scan skips the apps' migrations, so list them explicitly.
HIDDEN=()
for f in backend/*/migrations/0*.py; do
  m=${f#backend/}; m=${m%.py}; HIDDEN+=(--hidden-import "${m//\//.}")
done
"${PYTHON:-C:/cx-venv/Scripts/python.exe}" launcher/make_version_info.py
"$PYI" --noconfirm --clean --onefile --noconsole --icon "$ROOT/launcher/carte.ico" --name CarteExtract --version-file "$ROOT/launcher/version_info.txt" --paths "$ROOT/backend" \
  --workpath C:/cx-build --distpath dist-build --specpath C:/cx-build \
  --add-data "$ROOT/backend/core/assets;core/assets" \
  --add-data "$ROOT/frontend/dist;frontend_dist" \
  --add-data "$ROOT/launcher/seed_bundle.zip;." \
  --add-data "$ROOT/VERSION;." \
  --add-data "$ROOT/launcher/update_url.txt;." \
  --collect-all rest_framework --collect-all rest_framework_simplejwt --collect-all corsheaders \
  --collect-submodules core --collect-submodules employees --collect-submodules clients \
  --collect-submodules resources --collect-submodules projets --collect-submodules cadastre \
  --collect-submodules config \
  --hidden-import waitress --hidden-import django.contrib.admin --collect-all psycopg --collect-all psycopg_binary \
  --collect-all webview --collect-all pythonnet --collect-all clr_loader \
  --collect-all webview --collect-all pythonnet --collect-all clr_loader \
  --hidden-import config.settings --hidden-import config.urls --hidden-import config.wsgi \
  --hidden-import core.urls --hidden-import employees.urls --hidden-import clients.urls \
  --hidden-import resources.urls --hidden-import projets.urls --hidden-import cadastre.urls \
  "${HIDDEN[@]}" \
  launcher/carte_launcher.py
