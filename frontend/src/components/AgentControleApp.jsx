import React, { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { LayoutGrid, CalendarDays, FileScan, Map as MapIcon, AlertTriangle, MapPin, ChevronRight, ClipboardList } from "lucide-react";
import { STAGE_COLORS, STAGES } from "../constants";
import { parseDateFR } from "../utils/dates";
import { buildNotifications } from "../utils/notifications";
import PrestationDrawer from "./PrestationDrawer";
import NotificationBell from "./NotificationBell";
import CadastreTool from "./cadastre/CadastreTool";
import MapView from "./MapView";

const COLUMNS = [
  { key: "attente", label: "En attente", stages: ["demande", "prestation", "affectation", "execution", "bureau"] },
  { key: "controler", label: "À contrôler", stages: ["controle"] },
  { key: "livre", label: "Livré", stages: ["livraison"] },
];

function columnOf(stage) {
  return COLUMNS.find((c) => c.stages.includes(stage))?.key;
}

function dateForColumn(prestation, colKey) {
  if (colKey === "attente") return prestation.dateFinBureau || prestation.dateDebutExec;
  if (colKey === "controler") return prestation.dateFinBureau;
  if (colKey === "livre") return prestation.dateLivraison;
  return null;
}

function stageLabel(key) {
  return STAGES.find((s) => s.key === key)?.label || key;
}

function ControleCard({ task, client, colKey, onOpen }) {
  const { projet, ...prestation } = task;
  const date = dateForColumn(prestation, colKey);
  return (
    <button className="ab-card" onClick={() => onOpen(prestation.id)}>
      <div className="ab-card-stripe" style={{ background: STAGE_COLORS[prestation.stage] }} />
      <div className="ab-card-body">
        <div className="ab-card-top">
          <span className="ab-card-id gt-mono">{projet.id}</span>
          {prestation.cycles > 0 && (
            <span className="gt-status-pill warning">
              <AlertTriangle size={11} /> Repris
            </span>
          )}
        </div>
        <div className="ab-card-client">{client?.nom || "—"}</div>
        <div className="ab-card-nature">{prestation.natureExecutee || prestation.natureDemandee || "Prestation"}</div>
        <div className="ab-card-meta">
          <MapPin size={11} /> {projet.situation}
        </div>
        <div className="ab-card-bottom">
          <span className="ab-card-agents">{(prestation.agentChantier || []).join(", ") || "—"}</span>
          {date && <span className="ab-card-date">{date}</span>}
        </div>
        {(prestation.taches || []).length > 0 && (
          <div className="ab-card-taches">
            <ClipboardList size={11} /> {prestation.taches.map((t) => t.label).join(", ")}
          </div>
        )}
      </div>
    </button>
  );
}

function formatAgendaHeading(dateFR) {
  const t = parseDateFR(dateFR);
  if (t == null) return dateFR;
  const label = new Date(t).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ControleAgenda({ tasks, getClient, onOpen }) {
  const groups = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      const colKey = columnOf(t.stage);
      const date = colKey && dateForColumn(t, colKey);
      if (!date) return;
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(t);
    });
    return [...map.entries()].sort((a, b) => (parseDateFR(a[0]) || 0) - (parseDateFR(b[0]) || 0));
  }, [tasks]);

  return (
    <div className="ab-agenda">
      {groups.map(([dateFR, items]) => (
        <div className="ab-agenda-group" key={dateFR}>
          <div className="ab-agenda-date">{formatAgendaHeading(dateFR)}</div>
          {items.map((t) => (
            <button key={t.id} className="ab-agenda-item" onClick={() => onOpen(t.id)}>
              <span className="ab-agenda-dot" style={{ background: STAGE_COLORS[t.stage] }} />
              <span className="ab-agenda-item-body">
                <span className="ab-agenda-item-title">{getClient(t.projet.clientId)?.nom || t.projet.id}</span>
                <span className="ab-agenda-item-meta">{stageLabel(t.stage)} · {t.natureExecutee || t.natureDemandee || "Prestation"}</span>
              </span>
              <ChevronRight size={16} className="ab-agenda-chevron" />
            </button>
          ))}
        </div>
      ))}
      {groups.length === 0 && <div className="ab-col-empty">Aucun dossier à afficher.</div>}
    </div>
  );
}

export default function AgentControleApp({ currentUser, tasks, materiels, vehicules, employees, allProjets, getClient, onUpdatePrestation, onMarkCommentRead, onSyncHistory }) {
  const [tab, setTab] = useState("kanban");
  const [openId, setOpenId] = useState(null);

  const grouped = useMemo(() => {
    const map = { attente: [], controler: [], livre: [] };
    tasks.forEach((t) => {
      const key = columnOf(t.stage);
      if (key) map[key].push(t);
    });
    map.controler.sort((a, b) => (parseDateFR(a.dateFinBureau) || 0) - (parseDateFR(b.dateFinBureau) || 0));
    return map;
  }, [tasks]);

  const openTask = openId ? tasks.find((t) => t.id === openId) : null;
  const todoCount = grouped.controler.length;
  const notifications = useMemo(() => buildNotifications(currentUser, { tasks, getClient }), [currentUser, tasks, getClient]);

  return (
    <div className="ab-app">
      <div className="ab-header">
        <div>
          <div className="ab-header-greeting">Bonjour, {currentUser.name}</div>
          <div className="ab-header-sub">
            {todoCount > 0 ? `${todoCount} dossier${todoCount > 1 ? "s" : ""} à contrôler` : "Rien à contrôler pour le moment"}
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
            <button className={tab === "carte" ? "active" : ""} onClick={() => setTab("carte")}>
              <MapIcon size={14} /> Carte
            </button>
            <button className={tab === "cadastre" ? "active" : ""} onClick={() => setTab("cadastre")}>
              <FileScan size={14} /> Cadastre
            </button>
          </div>
          <NotificationBell notifications={notifications} onOpen={(n) => setOpenId(n.prestationId)} />
        </div>
      </div>

      {tab === "kanban" && (
        <div className="ab-kanban">
          {COLUMNS.map((col) => (
            <div className="ab-col" key={col.key}>
              <div className="ab-col-head">
                {col.label}
                <span className="ab-col-count">{grouped[col.key].length}</span>
              </div>
              <div className="ab-col-body">
                {grouped[col.key].map((t) => (
                  <ControleCard key={t.id} task={t} client={getClient(t.projet.clientId)} colKey={col.key} onOpen={setOpenId} />
                ))}
                {grouped[col.key].length === 0 && <div className="ab-col-empty">Aucun dossier.</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "calendrier" && (
        <div className="ab-fullpane">
          <ControleAgenda tasks={tasks} getClient={getClient} onOpen={setOpenId} />
        </div>
      )}

      {tab === "carte" && (
        <div className="ab-fullpane">
          <MapView
            projects={allProjets}
            getClient={getClient}
            currentUser={currentUser}
            onOpenProjet={(projetId) => {
              const match = tasks.find((t) => t.projet.id === projetId);
              if (match) setOpenId(match.id);
              setTab("kanban");
            }}
          />
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
              onClose={() => setOpenId(null)}
              onUpdate={onUpdatePrestation}
              onMarkCommentRead={onMarkCommentRead}
              onSyncHistory={onSyncHistory}
              currentUser={currentUser}
            />
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
