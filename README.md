# glbOps

Monorepo for the glbOps app.

- [frontend/](frontend/) — React + Vite frontend (see [frontend/README.md](frontend/README.md))
- [backend/](backend/) — Django + DRF API backend (see [backend/README.md](backend/README.md))

## Run everything with Docker

The whole stack — database, OCR service, API and frontend — comes up as a single
`glbops` project:

```bash
docker compose up -d --build
```

| Service | URL | What it is |
| --- | --- | --- |
| `frontend` | http://localhost:3001 | the built SPA, served by nginx |
| `backend` | http://localhost:8000/api/ | Django + DRF |
| `db` | `localhost:5433` | Postgres 16 + PostGIS |
| `ocr` | http://localhost:8500 | PaddleOCR service used by the cadastre/OCR feature |

Migrations run automatically when the `backend` container starts. To create a
login and load demo data:

```bash
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed_demo       # demo projets/clients/employés
docker compose exec backend python manage.py seed_cadastre   # reference cadastral lot
```

Ports are overridable from a root `.env` (`FRONTEND_PORT`, `BACKEND_PORT`,
`POSTGRES_PORT`, `OCR_PORT`) — useful since the OCR service avoids the 7681-8180
range, which Windows reserves on some machines.

Notes:

- `VITE_API_BASE_URL` is compiled into the frontend bundle at image build time,
  because Vite inlines `import.meta.env`. It points at the backend's **published
  host port**, since it is the browser that calls it. Change `BACKEND_PORT` and
  rebuild the frontend image (`docker compose build frontend`) together.
- The stack runs with `DJANGO_DEBUG=True`, so Django serves `/media/` and the
  admin's own static files. For a real deployment, turn that off and put static
  files behind nginx or whitenoise.
- The `db_data` / `ocr_models` volumes are pinned to their original names
  (`backend_db_data`, `backend_ocr_models`) so existing local data survived the
  move to a single root compose file.

## Run it locally instead

For day-to-day development, `backend/docker-compose.yml` starts only the database (port 5432) and
the OCR service, and you run Django and Vite on the host:

```bash
docker compose -f backend/docker-compose.yml up -d
```

Don't run it together with the root stack above: both use the same `backend_db_data` and
`backend_ocr_models` volumes.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv venv
./venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env

# The API still needs Postgres and (for the OCR feature) the OCR service:
docker compose up -d db ocr      # from the repo root

python manage.py migrate
python manage.py runserver
```
