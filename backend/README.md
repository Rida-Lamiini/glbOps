# Backend

Django + Django REST Framework API for glbOps.

## Setup

```bash
cd backend
python -m venv venv
./venv/Scripts/activate   # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env

# Start Postgres (see Database below) — compose lives at the repo root
docker compose -f ../docker-compose.yml up -d db

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Optionally load the same demo data the frontend ships with (`frontend/src/data/seed.js`):

```bash
python manage.py seed_demo
```

The API is served under `/api/`. `/api/health/` returns `{"status": "ok"}`.
All models are exposed as DRF `ModelViewSet`s registered on a `DefaultRouter`,
so each one also gets `/api/<resource>/<id>/` detail routes and the browsable
API UI.

CORS is configured via `DJANGO_CORS_ALLOWED_ORIGINS` in `.env` and defaults to
the Vite dev server at `http://localhost:5173`.

## Database

Postgres runs via Docker Compose (the root [`docker-compose.yml`](../docker-compose.yml),
which also builds the API and frontend images — see the root README to run the
whole stack in Docker), configured from the
same `.env` as Django (`POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_HOST`/`POSTGRES_PORT`):

```bash
# from the repo root
docker compose up -d db      # start
docker compose down          # stop (data persists in the db_data volume)
docker compose down -v       # stop and wipe the database
```

## Auth

JWT via `djangorestframework-simplejwt`:

- `POST /api/auth/token/` with `{"username", "password"}` → `{"access", "refresh"}`
- `POST /api/auth/token/refresh/` with `{"refresh"}` → `{"access"}`
- `GET /api/auth/me/` (requires `Authorization: Bearer <access>`) → current user

Access tokens last 1 hour, refresh tokens 7 days (`SIMPLE_JWT` in `config/settings.py`).
All endpoints default to `IsAuthenticatedOrReadOnly` — reads are public, writes require a
logged-in user.

## Media (file uploads)

Uploaded files are stored locally under `backend/media/` (gitignored) and served at
`/media/...` in development. `POST /api/attachments/` accepts multipart form data:

- `type` — `photo` | `livrable` | `autre`
- `label`
- `file`
- `content_type_model_input` — `projet` | `prestation` | `resource`
- `object_id` — the id of the record the file attaches to (e.g. `PRJ-2026-001`)

## OCR

Image attachments (`.png`/`.jpg`/`.jpeg`) are sent to a PaddleOCR
microservice (`ocr-service/`) on upload; the extracted text is stored on
`Attachment.ocr_text`. See `ocr-service/README.md` for the service itself
and `core/ocr.py` for the client. It runs as its own container:

```bash
docker compose up -d ocr
```

`OCR_SERVICE_URL` in `.env` points Django at it (`http://localhost:8500`
locally, `http://ocr:8000` if Django itself is containerized on the same
Compose network). A slow or unreachable OCR service never blocks an
upload — extraction failures are logged and `ocr_text` is left blank.

## Apps

- `core` — shared/base endpoints (health check, `/api/auth/me/`, `Attachment`) and the `seed_demo` management command.
- `employees` — `Employee`, `Conge` (leave requests). Endpoints: `/api/employees/`, `/api/conges/`.
- `clients` — `Client`. Endpoint: `/api/clients/`.
- `resources` — `Resource` (covers both `materiel` and `vehicule`, distinguished by `type`), `MaintenanceLogEntry`. Endpoints: `/api/resources/`, `/api/maintenance-log/`.
- `projets` — `Projet`, `Prestation`, `Tache`, `HistoryEntry`. Endpoints: `/api/projets/`, `/api/prestations/`, `/api/taches/`, `/api/history/`.
- `cadastre` — OCR ingestion of ANCFCC « Calcul de Contenances » documents: `Lot`, `Borne`, `DistanceCheck`, `ReferencePoint`. See below.

IDs are kept as human-readable string primary keys (`EMP-001`, `CLI-0231`, `PRJ-2026-001`, ...)
to match the identifiers already used across the frontend.


## Cadastre / OCR

Reads an ANCFCC « Calcul de Contenances » PDF, extracts the borne table, rebuilds the lot
geometry in Lambert Nord Maroc (EPSG:26191) and serves it as GeoJSON. The frontend screen
lives in `frontend/src/components/ocr/` and is reached from the **OCR** sidebar entry.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/cadastre/lots/parse-pdf/` | Extract a PDF (multipart, field `file`). Read-only — nothing is saved. |
| `GET` | `/api/cadastre/lots/` | List lots, optional `?q=` on titre foncier / propriété dite. |
| `POST` | `/api/cadastre/lots/` | Create a lot from reviewed bornes. |
| `GET` | `/api/cadastre/lots/<id>/` | Lot detail with bornes, distance checks, reference points. |
| `GET` | `/api/cadastre/lots/<id>/geojson/` | One lot as a FeatureCollection (polygon + bornes + reference points). |
| `GET` | `/api/cadastre/lots/geojson/` | Every lot's polygon, for the overview map. |

Surface, perimeter, centroid, borne lat/lng and distance-check deltas are **always recomputed
server-side** from the submitted bornes (`cadastre/geo/build_lot.py`) — the client never gets to
assert a geometry.

### Extraction pipeline

1. `cadastre/pdf/extract.py` tries the PDF's own text layer first. These documents are almost
   always image-only scans, so that usually comes back empty and OCR is the normal path, not a
   rare fallback.
2. Pages are rasterized at 300 DPI (PyMuPDF) and posted to the OCR service.
3. `cadastre/pdf/parse_bornes.py` parses the header and borne rows, and cross-checks them:
   name format, per-token OCR confidence, X/Y median-absolute-deviation outliers, and the
   sketch's radiating distances from the first borne. Suspect rows come back `flagged` with a
   reason and are highlighted for review — nothing is trusted blindly.

### OCR service

PaddleOCR runs as a separate container (`backend/ocr-service/`, see its README) because the
model stack is heavy and a page takes ~1 minute. Django reaches it via `OCR_SERVICE_URL`
(default `http://localhost:8500`).

```bash
# from the repo root
docker compose up -d db ocr
```

### PostGIS

`db` uses the `postgis/postgis:16-3.4-alpine` image. Each lot's `polygon` and `centroid` are
real `geometry(..., 4326)` columns (added in `cadastre/migrations/0002_postgis_geometry.py`),
read and written through raw SQL in `cadastre/db/geometry.py`. They are deliberately **not**
declared on the model: GeoDjango would require GDAL/GEOS system libraries on every machine that
runs the project, and nothing here needs ORM-level spatial querying. Moving to
`django.contrib.gis` later is a model change only — the columns are already the right type and
are GIST-indexed.

### Seed

```bash
python manage.py seed_cadastre
```

Creates the reference lot (Titre foncier 49539, « SAPINO 533 ») the OCR heuristics were tuned
against.
