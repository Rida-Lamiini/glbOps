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
(cd backend && venv/Scripts/python.exe manage.py test)       # 71 tests, creates a throw-away DB; must run from backend/ (from the root it finds 0)
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
  attachments (real upload), cadastre lots, client edits, employee edits/creation, congé CRUD, resource (matériel/véhicule) attachments — all round-trip through the real API now, none of it is local-only state. Vehicle papers (assurance, visite technique, vignette, kilométrage/entretien, carburant, conducteur) live on `resources.Resource`; due-date logic is in `frontend/src/utils/vehicule.js` and feeds the fleet cards, the Papiers tab, the bell, the Vue d'ensemble alerts and the affectation warning.
- Views: `OverviewDashboard` (KPI tiles link into the filtered Projets list via `onGo`), projets list +
  `KanbanBoard` (flow strip; "Sélection multiple" lets Dispatcher/Directrice bulk-add one agent chantier to every
  selected project's prestation(s) in the Affectation terrain / Exécution columns), `MapView` (main Carte: status
  pins, projet polygons, "Lots cadastraux" layer), `CalendarView`, `AnalyticsView` (shadcn Card/Tabs/Chart),
  `ClientsView`, resource/employee lists (`EmployeeListView` has a "Congés" month-calendar mode alongside "Liste",
  via `CongeCalendar.jsx`), `cadastre/CadastreTool` (PDF → OCR → review → lot), role apps (`AgentChantierApp`, …).
- Drawers use `DrawerTabs`; tables use `ResponsiveTableCard` (cards under ~720 px). Nav is defined once in `constants/nav.js`.
- Map polygon precedence: drawn `boundary` → saved lot polygon of that projet → deterministic approximate outline.

## Conventions / gotchas

- Match surrounding style; no new abstractions unless needed. shadcn components: `npx shadcn@latest add …` then fix
  any `from "cn"` imports to `@/lib/utils`.
- Tailwind v4 needs the base rule in `index.css` that sets `border-color: var(--color-border)`.
- Tests: `cadastre/tests.py` (geometry, PDF parser, lot reuse, review flow, attachments, boundary), `clients/tests.py`
  (client code rename), `core/tests.py` (comments, read receipts, mentions), `projets/tests.py` (PV and monthly report PDFs). Uploads in tests use a temp `MEDIA_ROOT`.
  The db container publishes Postgres on host port **5433** (`POSTGRES_PORT=5433` in `backend/.env`); pointing at 5432 makes every `manage.py` command hang.
- Testing in the Claude browser pane: it often becomes hidden (`document.visibilityState === "hidden"`), which freezes
  framer-motion views — reopen with `preview_start` (url). Heredocs with mixed quotes fail in the Bash tool: write a
  script file and run it instead. Windows paths in `docker exec` need `MSYS_NO_PATHCONV=1`.
- Don't kill processes you didn't start (a separate CadastOps `uvicorn` also listens on 8500).

## Not done yet / ideas

- Remove demo passwords before any deployment; schedule DB backups.

## PDF reports

Built on the server with PyMuPDF (already a dependency; no new one). `backend/core/pdf_kit.py` is the shared layout
(logo from `core/assets/logo.png`, running header, numbered footer, sections, key/value grid, KPI tiles, callouts,
tables, bars, columns, lot plot, photo grid, signatures), a port of the old jsPDF kit that keeps its millimetre
layout. PyMuPDF's bundled Nimbus fonts are embedded as Unicode fonts, so accents, "—", "≤", "²" print as-is.
Three documents, all login-required downloads:
- PV — `GET /api/prestations/<id>/pv/` (`projets/pv.py`): lot (the prestation's, else the projet's latest), up to 6
  field photos (downscaled to JPEG), bureau tâches, rejection history, contrôle, livraison. "Générer le PV" in the drawer.
- Lot report — `GET /api/cadastre/lots/<id>/report/` (`cadastre/report.py`). "Rapport PDF" on a lot.
- Monthly management report — `GET /api/reports/monthly/?month=YYYY-MM` (`projets/report_monthly.py`, Dispatcher/
  Directrice only, 403 otherwise); includes server ports of `vehiculeAlerts` and the agent workload. Launched from Analytique.
They reflect what is saved, not unsaved edits in an open drawer. `frontend/src/utils/reportKit.js` now only holds
`COLORS`/`safe()`/`loadLogo` for the QR label sheet (`labels.js`, still jsPDF in the browser, as is the map's PDF export).
To look at a PDF: render its pages with `fitz` (`page.get_pixmap(dpi=80).save(...)`) and open the PNGs.

## QR labels and check-out / check-in

Each matériel/véhicule has a QR label (`utils/labels.js`, A4 sheet of 3x7 labels; button "Étiquettes QR" on the list, "Imprimer l'étiquette" in the "Sorties & QR" tab). The QR encodes `${VITE_PUBLIC_URL || origin}/?ressource=ID` (`utils/resourceLink.js`) — a phone cannot open `localhost`, so set `VITE_PUBLIC_URL` before printing real labels. `App.jsx` shows `ResourceScan` (mobile page, all roles) after login when that param is present; office users can jump to the full drawer via `initialResource`. Movements live in `resources.ResourceMovement` (`POST /api/resources/<id>/movements/`, kind sortie|retour; 409 if already out, 400 if not out or not operational; a vehicle's return with mileage updates `Resource.kilometrage`). `Resource.sortie_courante` is derived from the latest movement.

## Cadastral lots on the Carte

`MapView` colours each lot by review status (validé green / vérifié blue / brouillon amber, dashed red outline when the surface gap exceeds 1 m²), puts a pin with the titre foncier at its centre (visible at any zoom — a 100 m lot is invisible otherwise), and opens a card with the status, surfaces and links ("Ouvrir le lot" → Cadastre via `cadastreLotId`, "Projet …"). The search box also finds lots (titre, propriété dite, projet), and the panel has a Lots tab. Lot page → "Voir sur la carte" zooms there (`mapFocusLotId`). `GET /api/cadastre/lots/geojson/` now carries `statut`, `conforme` and the two surfaces.

## Excel import of lots

`cadastre/excel_import.py` reads a workbook with a "Lots" sheet (one row per lot) and a "Bornes" sheet (one row per borne, keyed by titre foncier); header spellings are matched loosely (accents, case, units). `POST /api/cadastre/lots/parse-excel/` only reads and returns each lot with `errors` (block it) / `warnings` and the surface recomputed from the bornes; `GET /api/cadastre/lots/excel-template/` serves the blank workbook (two examples + instructions, and it parses back with no error — tested). The UI (`cadastre/ExcelImport.jsx`, button "Importer un fichier Excel" on the Cadastre page) shows a review table, then saves the ticked lots one by one through the normal `POST /api/cadastre/lots/` (so status = brouillon and the surface is recomputed as for a PDF). Needs `openpyxl` (in requirements.txt). `GET /api/cadastre/lots/export-excel/` (button "Exporter en Excel" next to the lot search) is the reverse: every current lot + its bornes, same two-sheet shape, so it round-trips back through the importer.

## Comments: @mentions and congé calendar

`CommentsPanel.jsx` has an `@` autocomplete over the `employees` list (typing `@` opens a matching-name
dropdown; picking one inserts `@Full Name `) and highlights `@Full Name` mentions when rendering a comment.
Mentions are persisted: `Comment.mentions` (M2M → Employee) is resolved server-side from the text on create/edit by
`core/mentions.py` (`@nom` must not run on into more letters; longest name wins, so "@Salma Idrissi" doesn't also
tag "Salma"), and the API returns them as current `{id, nom}` — so a mention survives the employee's rename.
`utils/notifications.js`'s `isMentioned()` checks that list (falling back to the text for a comment not yet saved)
to surface a "Mentionné par …" bell notification for a comment you didn't write and haven't already read
(`comment.isRead`, the same per-viewer field the read-receipts feature added).
`EmployeeListView` has a "Congés" mode (`CongeCalendar.jsx`) alongside "Liste": a month grid of who's on
congé (approuvé/en attente) each day, built from `employees[].conges` the same way the list view's "En congé
aujourd'hui" count is.

## Client code (code interne)

`NewClientModal` lets you type a client's `id`/"code interne" instead of auto-generating `CLI-XXXX`
(`nextClientId` in `utils/ids.js` — note it's `clients.length`-based, not max-suffix-based like the other
`next*Id` helpers, so it can collide after a deletion). `ClientDrawer`'s pencil icon lets you rename it later
too, but only while the client has no projets yet: `Client.id` is a real FK target (`projets.client_id`,
`on_delete=PROTECT`), and a plain `instance.save()` after mutating a Django primary key doesn't rename the
row — it silently inserts a second one under the new id and leaves the old row behind. `ClientViewSet.update`
(`backend/clients/views.py`) handles this explicitly: rejects the rename with a 400 if `instance.projets.exists()`
or the new id is taken, otherwise renames via `Client.objects.filter(pk=old).update(id=new)` (a real UPDATE,
not the instance-mutation path) before applying the rest of the patch. `editClient` in `GlobetudesProjets.jsx`
mirrors this on the frontend: the optimistic update moves the client to its new id (not just a `code` display
field), and keeps `openClientId` following it so the drawer doesn't close mid-edit; on a 400 it rolls back to
the old id and surfaces the server's actual reason. (Historical bug, fixed: the rename input used a
`gt-editbox` class that had no CSS anywhere, so it rendered with no border/background — visually
indistinguishable from plain text, though the input itself worked. Renamed to `gt-renamebox`, the class the
same pattern already uses correctly in `EmployeeDrawer`/`ResourceDrawer`.)

## Reminders

`buildNotifications` (Agent Chantier branch) pushes a "Visite demain" reminder for any prestation still at stage
`affectation` (visite planned, not yet started) whose `dateDebutExec` is tomorrow — `utils/dates.js`'s `isTomorrow()`
compares calendar day only, so a trailing time-of-day on that field doesn't throw off the match. Same derived,
no-separate-log pattern as the rest of the bell (congé/étalonnage/véhicule alerts, non-conformités, @mentions).
