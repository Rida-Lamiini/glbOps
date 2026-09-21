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

- Persist resource attachments; per-lot history entry on the prestation; DELETE/reload of attachments not UI-tested.
- Remove demo passwords before any deployment; schedule DB backups.

## PDF reports

`frontend/src/utils/reportKit.js` is the shared PDF layout (logo, running header, numbered footer, tables, KPI tiles, bars, lot plot, photo grid) built on jsPDF and WinAnsi-safe text (`safe()`). Three documents use it: `pv.js` (PV, now with the linked lot, field photos and the rejection history), `reportLot.js` (cadastral report, "Rapport PDF" on a lot) and `reportMonthly.js` (monthly management report, launched from Analytique). Everything runs in the browser; server-side generation is not done.
To check a PDF visually: patch `URL.createObjectURL` to capture the blob and render it with pdf.js from cdnjs in the pane (a page reload is needed after editing a util module — HMR does not refresh it).

## QR labels and check-out / check-in

Each matériel/véhicule has a QR label (`utils/labels.js`, A4 sheet of 3x7 labels; button "Étiquettes QR" on the list, "Imprimer l'étiquette" in the "Sorties & QR" tab). The QR encodes `${VITE_PUBLIC_URL || origin}/?ressource=ID` (`utils/resourceLink.js`) — a phone cannot open `localhost`, so set `VITE_PUBLIC_URL` before printing real labels. `App.jsx` shows `ResourceScan` (mobile page, all roles) after login when that param is present; office users can jump to the full drawer via `initialResource`. Movements live in `resources.ResourceMovement` (`POST /api/resources/<id>/movements/`, kind sortie|retour; 409 if already out, 400 if not out or not operational; a vehicle's return with mileage updates `Resource.kilometrage`). `Resource.sortie_courante` is derived from the latest movement.

## Cadastral lots on the Carte

`MapView` colours each lot by review status (validé green / vérifié blue / brouillon amber, dashed red outline when the surface gap exceeds 1 m²), puts a pin with the titre foncier at its centre (visible at any zoom — a 100 m lot is invisible otherwise), and opens a card with the status, surfaces and links ("Ouvrir le lot" → Cadastre via `cadastreLotId`, "Projet …"). The search box also finds lots (titre, propriété dite, projet), and the panel has a Lots tab. Lot page → "Voir sur la carte" zooms there (`mapFocusLotId`). `GET /api/cadastre/lots/geojson/` now carries `statut`, `conforme` and the two surfaces.

## Excel import of lots

`cadastre/excel_import.py` reads a workbook with a "Lots" sheet (one row per lot) and a "Bornes" sheet (one row per borne, keyed by titre foncier); header spellings are matched loosely (accents, case, units). `POST /api/cadastre/lots/parse-excel/` only reads and returns each lot with `errors` (block it) / `warnings` and the surface recomputed from the bornes; `GET /api/cadastre/lots/excel-template/` serves the blank workbook (two examples + instructions, and it parses back with no error — tested). The UI (`cadastre/ExcelImport.jsx`, button "Importer un fichier Excel" on the Cadastre page) shows a review table, then saves the ticked lots one by one through the normal `POST /api/cadastre/lots/` (so status = brouillon and the surface is recomputed as for a PDF). Needs `openpyxl` (in requirements.txt). Not done: exporting lots to Excel.
