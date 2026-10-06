# carte-extract

Standalone copy of glbOps limited to **Carte** (map), **Cadastre** (lots: PDF/OCR, Excel import, review, plan annotator)
and **Clients**. Projets are still loaded because the map pins, lot ownership and client files depend on them
(opened from the map card / client drawer); the other sections (kanban, calendar, analytics, employees, resources)
are hidden from the nav. It has its own DB, containers and ports, so it can run beside the original app.

| Service  | Port |
|----------|------|
| Postgres (PostGIS) | 5435 |
| OCR      | 8501 |
| Django API | 8001 |
| Vite UI  | 5174 |

```bash
cd backend
cp .env.example .env                       # then edit DJANGO_SECRET_KEY
docker compose up -d                       # db + ocr
python -m venv venv && venv/Scripts/pip install -r requirements.txt
venv/Scripts/python manage.py migrate
venv/Scripts/python manage.py seed_demo    # users (dispatcher / password123), clients, projets
venv/Scripts/python manage.py seed_cadastre
venv/Scripts/python manage.py runserver 8001

cd ../frontend
cp .env.example .env
npm install
npm run dev                                # http://localhost:5174
```

Use `127.0.0.1` for DB/OCR hosts on Windows (see the main CLAUDE.md).

## Standalone Windows .exe (SQLite, no Docker, no Postgres)

`dist-exe/CarteExtract.exe` is a single-file desktop app: a native window (Edge WebView2, no browser tabs, no console)
running the Django API + the built UI + a SQLite database on 127.0.0.1:8765 (a free port if that one is taken).
Closing the window stops the app. A log is written to `carte.log` in the data folder. Data lives in
`%LOCALAPPDATA%\CarteExtract` (database, uploaded plans); the first launch loads the bundled glbOps snapshot
(clients, projets, lots, plans). Delete that folder to start over. Map tiles need an internet connection.
OCR of scanned images is not included (PDF text extraction, Excel import, reports all work).

**Updates (new lots, clients, projets, plans):** a bundle `.zip` carries a snapshot; importing it is safe to repeat
(rows matched by id, nothing deleted).
- Export from glbOps (needs its database up):
  `cd backend && POSTGRES_PORT=5433 POSTGRES_DB=glbops CARTE_DATA_DIR=<glbops media parent> venv/Scripts/python manage.py export_bundle update.zip`
  (or point `.env` at the glbOps database).
- Import in the exe: sidebar **Données → Importer une mise à jour** (Dispatcher/Directrice), or
  `CARTE_DB=sqlite manage.py import_bundle update.zip`.

Rebuild the exe: see the header of `launcher/build_exe.sh` (short-path venv `C:/cx-venv`, `npm run build`, seed bundle).

## Online mode (shared Neon/Postgres database)

Put a file named `carte.env` next to `CarteExtract.exe` (or in `%LOCALAPPDATA%\CarteExtract`) containing one line:

    DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

The exe then uses that shared Postgres/PostGIS database instead of the local SQLite file, and uploaded plans/photos
are stored in the same database (table `core_storedfile`), so every PC sees the same lots, clients and files.
Without `carte.env` it runs offline on its own SQLite data. Never commit `carte.env` / `backend/.env.neon` (git-ignored).
For `manage.py` against the online database: `CARTE_ENV_FILE=backend/.env.neon python manage.py ...`.

## Release: installer, version, signing

Version = the single line in `VERSION` (shown in the sidebar, the exe's file properties, the installer, `/api/health/`).
`bash launcher/build_release.sh` builds the frontend, `dist-build/CarteExtract.exe`, and the per-user installer
`dist-installer/CarteGlobetudes-Setup-<version>.exe` (Inno Setup; Start-menu entry, optional desktop shortcut,
uninstaller; no admin rights; data in `%LOCALAPPDATA%\CarteExtract` is kept unless you accept deleting it on uninstall).

**Code signing** is automatic when you set `CARTE_SIGN_PFX` (path to your .pfx) and `CARTE_SIGN_PASSWORD` before
building: both the exe and the installer are signed (`launcher/sign.ps1`, SHA-256 + timestamp). It needs a certificate
from a CA (OV/EV code-signing); a self-signed one only proves the mechanism and is not trusted by SmartScreen.

## Backups (standalone mode)

A backup (zip: database snapshot + all uploaded files) is made automatically at start-up and then daily while the app
is open (14 kept), and on demand: sidebar **Sauvegardes** (Dispatcher/Directrice) → *Sauvegarder maintenant* /
*Restaurer*. A restore first saves the current state ("avant restauration"), then the app restarts on the chosen backup.
Files: `%LOCALAPPDATA%\CarteExtract\backups`. In online mode the database provider owns backups (Neon: enable
point-in-time restore in its console).

## Concurrent edits

Lots and projets carry a `version` that goes up on every edit. The app sends the version it loaded
(`X-Expected-Version`); if someone else saved in between, the save is refused with a 409 and a clear message instead of
overwriting their work (projets: the data is reloaded; lots: reload the lot). Requests without the header are not checked.

## How the pieces fit

**Client → Projet → Prestation → Lot.** A projet is a job at a place (titre foncier, location). A prestation is a piece of
work within it — Plan côté, MEC, COPRO, MT, Bornage… — moving through the 7 stages. A lot is the cadastral survey (bornes +
plan) attached to a prestation. The sidebar mirrors it: **Projets**, **Carte**, **Lots cadastraux**, **Clients**.

- Prestation natures come from one standard list (`frontend/src/constants/index.js`), so the stamps and filters stay consistent.
- A lot's **opération** (MT / MEC / COPRO) is not typed when the lot belongs to a projet: it follows that projet's prestations
  and updates by itself when they change (`cadastre/operations.py`, `cadastre/signals.py`). Only a lot with no projet carries a typed one.
- In a projet, each prestation shows its lots and an **Ajouter un lot** button that opens Lots cadastraux with the projet and
  prestation already chosen.

## Consultation: "what do we already have around here?"

Carte → **Consulter** (and the **Consultations** page) answer it for a position, a parcel or the agent's own phone.

- **Position**: click the map, latitude/longitude, Lambert X/Y (zone Nord/Sud) or an address; optional titre foncier. The
  panel lists every projet within 100 m – 1 km with distance, direction, relation (dans / chevauche / mitoyen / proche)
  and shared m². The verdict turns red when a **delivered or validated** survey already covers the ground, or when the
  same titre foncier was already treated (reuse the existing survey instead of redoing it).
- **Mappe / fichier**: paste the text of the ANCFCC « Consultation de la mappe cadastrale » page (`B14 X : … Y : …`) or
  drop a CSV, Excel, KML, GeoJSON or GPX file. Samples: `samples/`.
- **Près de moi**: open projets around the phone's GPS position; tick several to get the shortest trip (nearest-neighbour
  + 2-opt, ~30 km/h town speed, 20 min per visit).
- **Rapport PDF** of any consultation (map snapshot + neighbours table).
- **Consultations page**: history (who searched what, CSV export — the office sees everyone, agents only their own),
  **batch** (a list of parcels in → an Excel with the nearest projets of each), **reference layers** (neighbouring
  parcels such as T96988/03 imported from cadastre extracts, shown in purple) and **proximity alerts**.
- **Proximity alerts**: the first time a projet gets a location (pin, boundary or a lot polygon) the server compares it
  with the others and posts a notice (« un projet existe déjà à 80 m ») in the bell. Projets that existed before the
  feature are marked as already seen.

Backend: `backend/consultation/` (`/api/consultation/…`, needs `shapely`). Non-office users only see projets they are
assigned to. A projet's footprint is its drawn boundary, else the union of its lots, else its pin.
