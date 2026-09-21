# glbOps — project context

Field-survey operations platform (Globétudes): clients → projets → prestations moving through a
7-stage pipeline, plus a cadastral tool that turns ANCFCC "Calcul de Contenances" PDFs into lots on a map.
UI language is **French**; code, comments and commits are English.

## Stack

- **Backend** `backend/` — Django 6 + DRF + simplejwt, Postgres/PostGIS (Docker). Apps: `core`, `employees`,
  `clients`, `resources`, `projets`, `cadastre`. No GeoDjango: PostGIS columns (`cadastre_lots.polygon/centroid`)
  are read/written with raw SQL in `cadastre/db/geometry.py`. pyproj converts Lambert Nord Maroc (EPSG:26191) → WGS84.
- **OCR service** `backend/ocr-service/` — FastAPI + PaddleOCR PP-OCRv6 (`lang="fr"`), compose service `ocr`, port 8500.
  Client in `backend/core/ocr.py`; PDF text layer / rasterisation via PyMuPDF in `cadastre/pdf/`.
- **Frontend** `frontend/` — React 19 + Vite, Tailwind v4 (`src/index.css`), shadcn/ui (radix, new-york, JS),
  framer-motion, maplibre-gl, recharts 3. Path alias `@` → `src`.
- Design: "editorial cartography" — paper/ink/brick-red (`#b3261e`), Fraunces (display) + Hanken Grotesk (body).
  Tokens in `frontend/src/styles/tokens.css`; large hand-written stylesheet `styles/app.css` (+ `kanban.css`,
  `components/projet-drawer.css`, `components/cadastre/cadastre.css`). New CSS is appended to the end of `app.css`.

## Run it

```bash
docker compose -f backend/docker-compose.yml up -d        # db (postgis) + ocr
backend/venv/Scripts/python.exe backend/manage.py migrate
backend/venv/Scripts/python.exe backend/manage.py runserver   # :8000
npm --prefix frontend run dev                                 # :5173
backend/venv/Scripts/python.exe backend/manage.py test        # 25 tests, creates a throw-away DB
```

`.claude/launch.json` defines `backend` and `frontend` for the preview tool. Demo users come from `seed_demo`
(`dispatcher` / `password123`, roles Dispatcher, Directrice, Agent Chantier/Bureau/Contrôle); `seed_cadastre` seeds lots.
`backend/.env` is git-ignored — copy `.env.example`.

**Windows gotcha:** always use `127.0.0.1`, never `localhost`, for the DB and OCR (`POSTGRES_HOST`, `OCR_SERVICE_URL`).
`localhost` tries IPv6 first through the WSL relay and stalls ~8–30 s per connection.

## Domain model

- `Client 1─N Projet 1─N Prestation`; a prestation has `stage` (demande → prestation → affectation → execution → bureau
  → controle → livraison), agents (chantier M2M, bureau, contrôle FKs), tâches, history entries, attachments.
  A projet is always created with a first prestation at stage `demande`. Projet has lat/lng and a GeoJSON `boundary`.
- **Ids are strings** (`PRJ-2026-028`, `PRS-2026-107`, `CLI-0231`), minted client-side from the server maxima
  (`refreshSequences` in `GlobetudesProjets.jsx`) — never from list length.
- `core.Attachment` is generic (projet / prestation / resource): an uploaded `file` **or** a network `chemin`.
- `cadastre.Lot` (+ `Borne`, `DistanceCheck`, `ReferencePoint`): linked to `projet` (nullable), optionally `prestation`;
  `created_by`; review `statut` brouillon → verifie → valide (bureau/contrôle/office; editing resets to brouillon).
  `titre_foncier` is unique **per projet**, not globally. A lot can be **reused** on a later projet
  (`POST cadastre/lots/<id>/reuse/`): unowned → attached; owned elsewhere → copied with `derive_de` pointing at the original.
  `GET cadastre/lots/matches/` finds earlier lots by same titre or within N m (PostGIS `ST_DWithin`).
  Surface is always recomputed server-side from the bornes; conformity = écart ≤ 1 m².
- Roles gate the UI (`frontend/src/utils/access.js`): office sees everything; field/support roles see Projets, Carte,
  Calendrier scoped by `visibleToUser`.

## Frontend architecture

- `src/GlobetudesProjets.jsx` is the app shell and single source of state (large file): loads everything, holds
  `projets/clients/employees/…` in local state, **optimistic writes with rollback** through `apiPost/apiPatch/apiDelete`
  (`lib/api.js`, JWT in memory + refresh token in localStorage). Server JSON → UI shape in `lib/apiAdapters.js`.
  Persisted: projet create/edit/notes/boundary, prestation create/patch (stage, dates, agents, tâches, history),
  attachments (real upload), cadastre lots. Resources (matériel/véhicule: create, edit, maintenance log, vehicle papers) are persisted through `saveResource`/`createResource`; their attachments, employees/congés and client edits are still local-only. Vehicle papers (assurance, visite technique, vignette, kilométrage/entretien, carburant, conducteur) live on `resources.Resource`; due-date logic is in `frontend/src/utils/vehicule.js` and feeds the fleet cards, the Papiers tab, the bell, the Vue d'ensemble alerts and the affectation warning.
- Views: `OverviewDashboard`, projets list + `KanbanBoard` (flow strip), `MapView` (main Carte: status pins, projet
  polygons, "Lots cadastraux" layer), `CalendarView`, `AnalyticsView` (shadcn Card/Tabs/Chart), `ClientsView`,
  resource/employee lists, `cadastre/CadastreTool` (PDF → OCR → review → lot), role apps (`AgentChantierApp`, …).
- Drawers use `DrawerTabs`; tables use `ResponsiveTableCard` (cards under ~720 px). Nav is defined once in `constants/nav.js`.
- Map polygon precedence: drawn `boundary` → saved lot polygon of that projet → deterministic approximate outline.

## Conventions / gotchas

- Match surrounding style; no new abstractions unless needed. shadcn components: `npx shadcn@latest add …` then fix
  any `from "cn"` imports to `@/lib/utils`.
- Tailwind v4 needs the base rule in `index.css` that sets `border-color: var(--color-border)`.
- Tests: `cadastre/tests.py` (geometry, PDF parser, lot reuse, review flow, attachments, boundary). Uploads in tests use a temp `MEDIA_ROOT`.
- Testing in the Claude browser pane: it often becomes hidden (`document.visibilityState === "hidden"`), which freezes
  framer-motion views — reopen with `preview_start` (url). Heredocs with mixed quotes fail in the Bash tool: write a
  script file and run it instead. Windows paths in `docker exec` need `MSYS_NO_PATHCONV=1`.
- Don't kill processes you didn't start (a separate CadastOps `uvicorn` also listens on 8500).

## Not done yet / ideas

- Search lots directly on the Carte (currently: Cadastre page search, or zoom with the lots layer on).
- Persist resource attachments; per-lot history entry on the prestation; DELETE/reload of attachments not UI-tested.
- Remove demo passwords before any deployment; schedule DB backups.
