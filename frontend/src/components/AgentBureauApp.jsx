import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, CalendarDays, FileScan, AlertTriangle, MapPin, ChevronRight, ChevronLeft, CheckCircle2, Circle } from "lucide-react";
import { STAGE_COLORS, STAGES } from "../constants";
import { parseDateFR, formatDateFR, today } from "../utils/dates";
import { notifySuccess } from "../utils/notify";
import { rejectionReason, buildNotifications } from "../utils/notifications";
import PrestationDrawer from "./PrestationDrawer";
import NotificationBell from "./NotificationBell";
import CadastreTool from "./cadastre/CadastreTool";

const COLUMNS = [
  { key: "attente", label: "En attente terrain", stages: ["demande", "prestation", "affectation", "execution"] },
  { key: "traiter", label: "À traiter", stages: ["bureau"] },
  { key: "controle", label: "Envoyé au contrôle", stages: ["controle"] },
  { key: "livre", label: "Livré", stages: ["livraison"] },
];

function columnOf(stage) {
  return COLUMNS.find((c) => c.stages.includes(stage))?.key;
}

function dateForColumn(prestation, colKey) {
  if (colKey === "attente") return prestation.dateDebutExec;
  if (colKey === "traiter") return prestation.dateFinExec;
  if (colKey === "controle") return prestation.dateFinBureau;
  if (colKey === "livre") return prestation.dateLivraison;
  return null;
}

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: (i) => ({ opacity: 1, y: 0, transition: { duration: 0.28, delay: Math.min(i, 8) * 0.035, ease: [0.22, 1, 0.36, 1] } }),
};

// One kanban card per bureau tâche rather than per dossier: a prestation with three tâches
// produces three cards (same projet id, different tâche), so a card can be sent to "Envoyé au
// contrôle" on its own — dragging it there just marks that one tâche done, it doesn't touch the
// prestation's real pipeline stage. A prestation with no tâches yet falls back to a single card.
// The dossier itself only actually reaches the backend "controle" stage — reference, dates, PV —
// once every tâche is done and the agent uses the drawer's own "Envoyer au contrôle" action.
function buildColumns(tasks) {
  const cols = { attente: [], traiter: [], controle: [], livre: [] };
  tasks.forEach((prestation) => {
    const colKey = columnOf(prestation.stage);
    if (!colKey) return;
    const taches = prestation.taches || [];
    if (colKey === "traiter" && taches.length > 0) {
      taches.forEach((tache) => cols[tache.done ? "controle" : "traiter"].push({ prestation, tache }));
      return;
    }
    if (taches.length === 0) {
      cols[colKey].push({ prestation, tache: null });
    } else {
      taches.forEach((tache) => cols[colKey].push({ prestation, tache }));
    }
  });
  cols.traiter.sort((a, b) => (parseDateFR(a.prestation.dateFinExec) || 0) - (parseDateFR(b.prestation.dateFinExec) || 0));
  cols.attente.sort((a, b) => (rejectionReason(b.prestation) ? 1 : 0) - (rejectionReason(a.prestation) ? 1 : 0));
  return cols;
}

function BureauCard({ prestation: task, tache, client, colKey, index, onOpen, onDragStart, draggable }) {
  const { projet, ...prestation } = task;
  const date = dateForColumn(prestation, colKey);
  const reason = rejectionReason(prestation);
  const taches = prestation.taches || [];
  const tacheIdx = tache ? taches.findIndex((t) => t.label === tache.label) : -1;
  const agents = tache ? tache.agents : prestation.agentChantier;
  const title = tache ? tache.label : prestation.natureExecutee || prestation.natureDemandee || "Prestation";
  return (
    <motion.button
      className="ab-card"
      onClick={() => onOpen(prestation.id, tache?.label)}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, prestation.id, tache.label) : undefined}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="show"
      layout
    >
      <div className="ab-card-stripe" style={{ background: reason ? "var(--status-danger)" : STAGE_COLORS[prestation.stage] }} />
      <div className="ab-card-body">
        <div className="ab-card-top">
          <span className="ab-card-id gt-mono">{projet.id}</span>
          {reason ? (
            <span className="gt-status-pill danger">
              <AlertTriangle size={11} /> Retour
            </span>
          ) : tache ? (
            tache.done ? (
              <CheckCircle2 size={14} className="ab-card-taskicon is-done" aria-label="Tâche terminée" />
            ) : (
              <Circle size={14} className="ab-card-taskicon" aria-label="Tâche en cours" />
            )
          ) : null}
        </div>
        <div className="ab-card-nature">{title}</div>
        <div className="ab-card-client">{client?.nom || "—"}</div>
        {tache && taches.length > 1 && (
          <div className="ab-card-tacheindex">Tâche {tacheIdx + 1}/{taches.length} du dossier</div>
        )}
        {reason && (
          <div className="ab-card-rejectreason">
            <AlertTriangle size={11} /> {reason}
          </div>
        )}
        <div className="ab-card-meta">
          <MapPin size={11} /> {projet.situation}
        </div>
        <div className="ab-card-bottom">
          <span className="ab-card-agents">{(agents || []).join(", ") || "—"}</span>
          {date && <span className="ab-card-date">{date}</span>}
        </div>
      </div>
    </motion.button>
  );
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MAX_PILLS_PER_DAY = 3;

function monthLabel(cursor) {
  const label = cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Only what's actually his to act on: pending tâches (the "À traiter" column), laid out as a real
// desk-diary month grid instead of a flat list. Terrain visits not yet at his stage, dossiers
// already sent to contrôle and old deliveries are noise on a personal agenda, so they're left out.
function BureauAgenda({ cards, getClient, onOpen }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const map = new Map();
    cards.forEach((card) => {
      const t = parseDateFR(card.prestation.dateFinExec);
      if (t == null) return;
      const key = formatDateFR(new Date(t));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(card);
    });
    return map;
  }, [cards]);

  const weeks = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      const d = new Date(year, month, i - firstWeekday + 1);
      cells.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(year, month, day), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const d = new Date(year, month, cells.length - firstWeekday - daysInMonth + 1);
      cells.push({ date: d, inMonth: false });
    }
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cursor]);

  const now = new Date();
  const totalThisMonth = [...byDay.entries()].filter(([key]) => {
    const t = parseDateFR(key);
    return t != null && new Date(t).getFullYear() === cursor.getFullYear() && new Date(t).getMonth() === cursor.getMonth();
  }).reduce((sum, [, items]) => sum + items.length, 0);

  return (
    <div className="ab-cal">
      <div className="ab-cal-toolbar">
        <div className="ab-cal-month">
          <span>{monthLabel(cursor)}</span>
          <span className="ab-cal-monthcount">{totalThisMonth} tâche{totalThisMonth > 1 ? "s" : ""}</span>
        </div>
        <div className="ab-cal-nav">
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Mois précédent">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="ab-cal-today" onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))}>
            Aujourd'hui
          </button>
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Mois suivant">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="ab-cal-weekdays">
        {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
      </div>

      <div className="ab-cal-grid">
        {weeks.flat().map(({ date, inMonth }, i) => {
          const key = formatDateFR(date);
          const items = byDay.get(key) || [];
          const shown = items.slice(0, MAX_PILLS_PER_DAY);
          const hidden = items.length - shown.length;
          const isToday = sameDay(date, now);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div key={i} className={`ab-cal-cell ${inMonth ? "" : "is-outside"} ${isWeekend ? "is-weekend" : ""} ${items.length ? "has-items" : ""}`}>
              <span className={`ab-cal-daynum ${isToday ? "is-today" : ""}`}>{date.getDate()}</span>
              <div className="ab-cal-pills">
                {shown.map(({ prestation, tache }) => {
                  const reason = rejectionReason(prestation);
                  const title = tache ? tache.label : prestation.natureExecutee || prestation.natureDemandee || "Prestation";
                  return (
                    <button
                      key={`${prestation.id}-${tache ? tache.label : "dossier"}`}
                      type="button"
                      className="ab-cal-pill"
                      style={{ "--pill": reason ? "var(--status-danger)" : STAGE_COLORS[prestation.stage] }}
                      onClick={() => onOpen(prestation.id, tache?.label)}
                      title={`${title} — ${getClient(prestation.projet.clientId)?.nom || prestation.projet.id}`}
                    >
                      {title}
                    </button>
                  );
                })}
                {hidden > 0 && <span className="ab-cal-more">+{hidden}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AgentBureauApp({ currentUser, tasks, materiels, vehicules, employees, allProjets, getClient, onUpdatePrestation, onMarkCommentRead, onSyncHistory }) {
  const [tab, setTab] = useState("kanban");
  const [openId, setOpenId] = useState(null);
  const [focusTache, setFocusTache] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Opening from a tâche card carries which tâche was clicked, so the drawer can put it front
  // and center; opening from the bell or the agenda (whole-dossier context) has none.
  const openDrawer = (prestationId, tacheLabel = null) => {
    setOpenId(prestationId);
    setFocusTache(tacheLabel);
  };

  const columns = useMemo(() => buildColumns(tasks), [tasks]);

  // Drag-and-drop only makes sense for the one thing Agent Bureau controls themselves: a tâche
  // card dropped onto "Envoyé au contrôle" marks that one tâche done — it does not send the whole
  // dossier forward (that still needs the drawer's own button, once every tâche is done).
  const handleDragStart = (e, prestationId, tacheLabel) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ prestationId, tacheLabel }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e, targetColKey) => {
    e.preventDefault();
    setDragOverCol(null);
    if (targetColKey !== "controle") return;
    let prestationId, tacheLabel;
    try {
      ({ prestationId, tacheLabel } = JSON.parse(e.dataTransfer.getData("text/plain")));
    } catch {
      return;
    }
    const task = tasks.find((t) => t.id === prestationId);
    const tache = task?.taches?.find((t) => t.label === tacheLabel);
    if (!task || !tache || tache.done) return;

    const updatedTaches = task.taches.map((t) => (t.label === tacheLabel ? { ...t, done: true } : t));
    onUpdatePrestation(prestationId, {
      taches: updatedTaches,
      history: [
        ...task.history,
        { date: today(), label: `Tâche envoyée au contrôle — ${tacheLabel}`, author: currentUser.name || currentUser.role },
      ],
    });
    const remaining = updatedTaches.filter((t) => !t.done).length;
    notifySuccess(remaining > 0 ? `Tâche envoyée au contrôle — ${remaining} restante${remaining > 1 ? "s" : ""}` : "Toutes les tâches sont prêtes — envoyez le dossier au contrôle depuis sa fiche");
  };

  const openTask = openId ? tasks.find((t) => t.id === openId) : null;
  const todoCount = columns.traiter.length;
  const rejectedCount = tasks.filter((t) => rejectionReason(t)).length;
  const notifications = useMemo(() => buildNotifications(currentUser, { tasks, getClient }), [currentUser, tasks, getClient]);

  const todayFR = today();

  return (
    <div className="ab-app">
      <div className="ab-header">
        <div className="ab-header-left">
          <div className="ab-header-eyebrow">
            <span>Espace bureau</span>
            <i />
            <span className="gt-mono">{todayFR}</span>
          </div>
          <div className="ab-header-greeting">Bonjour, {currentUser.name}</div>
          <div className="ab-header-row">
            <span className={`ab-header-chip ${todoCount > 0 ? "is-live" : ""}`}>
              {todoCount > 0 ? `${todoCount} tâche${todoCount > 1 ? "s" : ""} à traiter` : "Rien à traiter pour le moment"}
            </span>
            {rejectedCount > 0 && (
              <span className="ab-header-chip is-danger">
                <AlertTriangle size={12} /> {rejectedCount} renvoyé{rejectedCount > 1 ? "s" : ""} au terrain
              </span>
            )}
          </div>
        </div>
        <div className="ab-header-right">
          <div className="ab-tabs">
            <button className={tab === "kanban" ? "active" : ""} onClick={() => setTab("kanban")}>
              <LayoutGrid size={14} /> Kanban
            </button>
            <button className={tab === "calendrier" ? "active" : ""} onClick={() => setTab("calendrier")}>
              <CalendarDays size={14} /> Agenda
            </button>
            <button className={tab === "cadastre" ? "active" : ""} onClick={() => setTab("cadastre")}>
              <FileScan size={14} /> Cadastre
            </button>
          </div>
          <NotificationBell notifications={notifications} onOpen={(n) => openDrawer(n.prestationId)} />
        </div>
      </div>

      {tab === "kanban" && (
        <div className="ab-kanban">
          {COLUMNS.map((col, colIdx) => {
            const cards = columns[col.key];
            return (
              <div className="ab-col" key={col.key}>
                <div className="ab-col-head">
                  <span className="ab-col-index gt-mono">{String(colIdx + 1).padStart(2, "0")}</span>
                  <span className="ab-col-label">{col.label}</span>
                  <span className="ab-col-count">{cards.length}</span>
                </div>
                <div
                  className={`ab-col-body ${dragOverCol === col.key ? "drag-over" : ""}`}
                  onDragOver={col.key === "controle" ? (e) => { e.preventDefault(); setDragOverCol("controle"); } : undefined}
                  onDragLeave={col.key === "controle" ? () => setDragOverCol(null) : undefined}
                  onDrop={col.key === "controle" ? (e) => handleDrop(e, col.key) : undefined}
                >
                  {cards.map(({ prestation, tache }, i) => (
                    <BureauCard
                      key={`${prestation.id}-${tache ? tache.label : "dossier"}`}
                      prestation={prestation}
                      tache={tache}
                      index={i}
                      client={getClient(prestation.projet.clientId)}
                      colKey={col.key}
                      onOpen={openDrawer}
                      draggable={col.key === "traiter" && tache != null}
                      onDragStart={handleDragStart}
                    />
                  ))}
                  {cards.length === 0 && <div className="ab-col-empty">Aucun dossier.</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "calendrier" && (
        <div className="ab-fullpane">
          <BureauAgenda cards={columns.traiter} getClient={getClient} onOpen={openDrawer} />
        </div>
      )}

      {tab === "cadastre" && (
        <div className="ab-fullpane ab-fullpane-scroll">
          <CadastreTool projets={allProjets} currentUser={currentUser} getClient={getClient} />
        </div>
      )}

      <AnimatePresence>
        {openTask && (() => {
          const { projet, ...prestation } = openTask;
          return (
            <PrestationDrawer
              key={prestation.id}
              projet={projet}
              client={getClient(projet.clientId)}
              prestation={prestation}
              materiels={materiels}
              vehicules={vehicules}
              employees={employees}
              allProjets={allProjets}
              onClose={() => { setOpenId(null); setFocusTache(null); }}
              onUpdate={onUpdatePrestation}
              onMarkCommentRead={onMarkCommentRead}
              onSyncHistory={onSyncHistory}
              currentUser={currentUser}
              focusTache={focusTache}
            />
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
