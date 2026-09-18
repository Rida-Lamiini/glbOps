# Backend

Django + Django REST Framework API for glbOps.

## Setup

```bash
cd backend
python -m venv venv
./venv/Scripts/activate   # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env

# Start Postgres (see Database below)
docker compose up -d db

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

Postgres runs via Docker Compose (`docker-compose.yml`), configured from the
same `.env` as Django (`POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_HOST`/`POSTGRES_PORT`):

```bash
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

IDs are kept as human-readable string primary keys (`EMP-001`, `CLI-0231`, `PRJ-2026-001`, ...)
to match the identifiers already used across the frontend.
