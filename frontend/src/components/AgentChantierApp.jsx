import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList,
  Map as MapIcon,
  CalendarDays,
  ChevronLeft,
  MapPin,
  Users,
  Wrench,
  Truck,
  Clock,
  AlertTriangle,
  PauseCircle,
  ChevronRight,
  Paperclip,
  Navigation,
} from "lucide-react";
import { STAGES, STAGE_COLORS } from "../constants";
import { today, parseDateFR, nextBusinessDayFR, splitDateTimeFR, nowTime } from "../utils/dates";
import { canAct } from "../utils/access";
import { notifySuccess } from "../utils/notify";
import { buildNotifications } from "../utils/notifications";
import PipelineStepper from "./PipelineStepper";
import HistoriqueTimeline from "./HistoriqueTimeline";
import AttachmentsPanel from "./AttachmentsPanel";
import NotificationBell from "./NotificationBell";
import MapView from "./MapView";
import { DateTimeField } from "@/components/ui/datetime-field";

const ACTIONABLE_STAGES = ["affectation", "execution"];

// var(--amber) is too light for white text to stay readable (WCAG contrast ~2.9:1),
// so badges on that stage use dark ink text instead.
const DARK_TEXT_STAGES = ["execution"];

function stageLabel(key) {
  return STAGES.find((s) => s.key === key)?.label || key;
}

function stageBadgeTextColor(stage) {
  return DARK_TEXT_STAGES.includes(stage) ? "var(--ink)" : "#fff";
}

function googleMapsDirectionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function TaskCard({ task, onOpen }) {
  const { projet, ...prestation } = task;
  const actionable = ACTIONABLE_STAGES.includes(prestation.stage);
  const hasLocation = projet.lat != null && projet.lng != null;
  return (
    <div className={`ac-taskcard ${actionable ? "actionable" : ""}`}>
      <button className="ac-taskcard-main" onClick={() => onOpen(prestation.id)}>
        <div className="ac-taskcard-stripe" style={{ background: STAGE_COLORS[prestation.stage] }} />
        <div className="ac-taskcard-body">
          <div className="ac-taskcard-top">
            <span className="ac-taskcard-id">{projet.id}</span>
            {prestation.cycles > 0 && (
              <span className="ac-taskcard-flag">
                <AlertTriangle size={12} /> Retour
              </span>
            )}
          </div>
          <div className="ac-taskcard-nature">{prestation.natureDemandee || "Prestation"}</div>
          <div className="ac-taskcard-meta">
            <MapPin size={13} /> {projet.situation}
          </div>
          <div className="ac-taskcard-bottom">
            <span className="ac-stagebadge" style={{ background: STAGE_COLORS[prestation.stage], color: stageBadgeTextColor(prestation.stage) }}>
              {stageLabel(prestation.stage)}
            </span>
            {prestation.dateDebutExec && <span className="ac-taskcard-date">{prestation.dateDebutExec}</span>}
          </div>
        </div>
        <ChevronRight size={20} className="ac-taskcard-chevron" />
      </button>
      {hasLocation && (
        <a
          className="ac-taskcard-navbtn"
          href={googleMapsDirectionsUrl(projet.lat, projet.lng)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Ouvrir l'itinéraire dans Google Maps"
        >
          <Navigation size={17} />
        </a>
      )}
    </div>
  );
}

function formatAgendaHeading(dateFR) {
  const t = parseDateFR(dateFR);
  if (t == null) return dateFR;
  const label = new Date(t).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function AgentPlanning({ tasks, onOpen }) {
  const todayKey = today();
  const groups = useMemo(() => {
    const map = new Map();
    tasks.filter((t) => t.dateDebutExec).forEach((t) => {
      if (!map.has(t.dateDebutExec)) map.set(t.dateDebutExec, []);
      map.get(t.dateDebutExec).push(t);
    });
    return [...map.entries()].sort((a, b) => (parseDateFR(a[0]) || 0) - (parseDateFR(b[0]) || 0));
  }, [tasks]);

  return (
    <div className="ac-agenda">
      {groups.map(([dateFR, items]) => (
        <div className="ac-agenda-group" key={dateFR}>
          <div className={`ac-agenda-date ${dateFR === todayKey ? "today" : ""}`}>
            {dateFR === todayKey ? "Aujourd'hui" : formatAgendaHeading(dateFR)}
          </div>
          {items.map((t) => {
            const hasLocation = t.projet.lat != null && t.projet.lng != null;
            return (
              <div key={t.id} className="ac-agenda-item">
                <button className="ac-agenda-item-main" onClick={() => onOpen(t.id)}>
                  <span className="ac-agenda-dot" style={{ background: STAGE_COLORS[t.stage] }} />
                  <span className="ac-agenda-item-body">
                    <span className="ac-agenda-item-title">{t.natureDemandee || "Prestation"}</span>
                    <span className="ac-agenda-item-meta"><MapPin size={11} /> {t.projet.situation}</span>
                  </span>
                  <ChevronRight size={16} className="ac-taskcard-chevron" />
                </button>
                {hasLocation && (
                  <a
                    className="ac-taskcard-navbtn"
                    href={googleMapsDirectionsUrl(t.projet.lat, t.projet.lng)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Ouvrir l'itinéraire dans Google Maps"
                  >
                    <Navigation size={16} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {groups.length === 0 && <div className="ac-empty">Aucune visite planifiée.</div>}
    </div>
  );
}

function TaskDetail({ task, client, materiels, vehicules, currentUser, onUpdate, onClose }) {
  const { projet, ...prestation } = task;
  const stage = prestation.stage;
  const allowed = canAct(stage, currentUser);
  const hasLocation = projet.lat != null && projet.lng != null;

  const [natureExecutee, setNatureExecutee] = useState(prestation.natureExecutee || "");
  const [dateFinExec, setDateFinExec] = useState(prestation.dateFinExec || "");
  const [showReprog, setShowReprog] = useState(false);
  const [reprogDate, setReprogDate] = useState("");
  const [reprogMotif, setReprogMotif] = useState("");

  const materielObjs = (prestation.materielIds || []).map((id) => materiels.find((m) => m.id === id)).filter(Boolean);
  const vehiculeObj = vehicules.find((v) => v.id === prestation.vehiculeId);

  const author = currentUser.name || currentUser.role;

  const push = (patch, label) => {
    onUpdate(prestation.id, {
      ...patch,
      history: [...prestation.history, { date: today(), label, author }],
    });
    notifySuccess(label);
  };

  const handleAddAttachments = (newItems) => {
    if (newItems.length === 0) return;
    push(
      { attachments: [...prestation.attachments, ...newItems] },
      `${newItems.length} pièce${newItems.length > 1 ? "s" : ""} jointe${newItems.length > 1 ? "s" : ""} ajoutée${newItems.length > 1 ? "s" : ""} : ${newItems.map((f) => f.name || f.chemin).join(", ")}`
    );
  };

  const removeAttachment = (index) => {
    const removed = prestation.attachments[index];
    push(
      { attachments: prestation.attachments.filter((_, i) => i !== index) },
      `Pièce jointe supprimée : ${removed?.label ? `${removed.label} — ` : ""}${removed?.name || removed?.chemin || "—"}`
    );
  };

  return (
    <motion.div className="ac-detail" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 340, damping: 32 }}>
      <div className="ac-detail-head">
        <button className="ac-iconbtn" onClick={onClose}>
          <ChevronLeft size={22} />
        </button>
        <div className="ac-detail-headtext">
          <div className="ac-detail-id">{prestation.id} · {projet.id}</div>
          <div className="ac-detail-client">{client?.nom || "—"}</div>
        </div>
      </div>

      <div className="ac-detail-body">
        <div className="ac-detail-chips">
          <span className="ac-chip"><MapPin size={12} /> {projet.situation}</span>
          <span className="ac-chip">Réf. {projet.referenceFonciere}</span>
        </div>

        {hasLocation && (
          <a
            className="ac-btn ac-btn-outline ac-navbtn-wide"
            href={googleMapsDirectionsUrl(projet.lat, projet.lng)}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={16} /> Ouvrir l'itinéraire dans Google Maps
          </a>
        )}

        <div className="ac-detail-pipeline">
          <PipelineStepper stage={stage} cycles={prestation.cycles} />
        </div>

        {stage === "affectation" && (
          <div className="ac-card">
            <div className="ac-card-row"><Users size={15} /> {(prestation.agentChantier || []).join(", ") || "—"}</div>
            <div className="ac-card-row"><Wrench size={15} /> {materielObjs.map((m) => m.nom).join(", ") || "—"}</div>
            <div className="ac-card-row"><Truck size={15} /> {vehiculeObj?.nom || "—"}</div>
            <div className="ac-card-row"><Clock size={15} /> Visite prévue le {prestation.dateDebutExec}</div>
            {allowed ? (
              <button
                className="ac-btn ac-btn-primary"
                onClick={() => push({ stage: "execution" }, `Passage à l'exécution — visite du ${prestation.dateDebutExec}`)}
              >
                Démarrer l'exécution
              </button>
            ) : (
              <div className="ac-readonly">En attente de l'agent chantier assigné</div>
            )}
          </div>
        )}

        {stage === "execution" && (
          allowed ? (
            <div className="ac-card">
              {prestation.reprogramme && (
                <div className="ac-notice ac-notice-amber">Visite précédente inachevée — reprise prévue le {prestation.dateDebutExec}</div>
              )}
              {prestation.cycles > 0 && (
                <div className="ac-notice ac-notice-bad">
                  <AlertTriangle size={14} /> Renvoyé pour reprise — une nouvelle exécution est requise.
                </div>
              )}
              <label className="ac-label">Ce qui a été fait sur le terrain</label>
              <textarea className="ac-textarea" rows={4} value={natureExecutee} onChange={(e) => setNatureExecutee(e.target.value)} placeholder="Décrire l'exécution..." />
              <label className="ac-label">Date et heure de fin d'exécution</label>
              <DateTimeField value={dateFinExec} onChange={setDateFinExec} className="ac-dateinput" />
              <button
                className="ac-btn ac-btn-primary"
                disabled={!natureExecutee || !dateFinExec}
                onClick={() => push({ stage: "bureau", natureExecutee, dateFinExec, reprogramme: false }, `Exécution saisie — ${natureExecutee}`)}
              >
                Envoyer au bureau
              </button>

              {prestation.reprogramme ? (
                <div className="ac-readonly">
                  <PauseCircle size={14} style={{ verticalAlign: -2 }} /> Reprise déjà programmée — terminez cette visite avant d'en signaler une autre.
                </div>
              ) : !showReprog ? (
                <button
                  className="ac-btn ac-btn-outline"
                  onClick={() => {
                    const { timePart } = splitDateTimeFR(dateFinExec);
                    setReprogDate(`${nextBusinessDayFR(prestation.dateDebutExec)} ${timePart || nowTime()}`);
                    setShowReprog(true);
                  }}
                >
                  <PauseCircle size={16} /> Mission non terminée
                </button>
              ) : (
                <div className="ac-reprog">
                  <label className="ac-label">Pourquoi la mission n'est pas terminée</label>
                  <textarea
                    className="ac-textarea"
                    rows={3}
                    value={reprogMotif}
                    onChange={(e) => setReprogMotif(e.target.value)}
                    placeholder="Ce qui a bloqué / reste à faire..."
                  />
                  <label className="ac-label">Nouvelle date de visite proposée <span className="ac-label-hint">(suggestion — modifiable, à valider par le dispatcher)</span></label>
                  <DateTimeField value={reprogDate} onChange={setReprogDate} className="ac-dateinput" todayLabel="Maintenant" />
                  <button
                    className="ac-btn ac-btn-primary"
                    disabled={!reprogDate || !reprogMotif.trim()}
                    onClick={() => {
                      push(
                        { dateDebutExec: reprogDate, reprogramme: true },
                        `Visite partielle — ${reprogMotif.trim()}. Reprise prévue le ${reprogDate}`
                      );
                      setShowReprog(false);
                      setReprogMotif("");
                      setReprogDate("");
                    }}
                  >
                    Reprogrammer
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="ac-readonly">Réservé à l'agent chantier assigné</div>
          )
        )}

        {!ACTIONABLE_STAGES.includes(stage) && (
          <div className="ac-card">
            <div className="ac-notice">
              {stage === "bureau" && "En cours de traitement au bureau."}
              {stage === "controle" && "En cours de contrôle qualité."}
              {stage === "livraison" && "Livrée — dossier archivé."}
              {(stage === "demande" || stage === "prestation") && "En attente de préparation par le bureau."}
            </div>
          </div>
        )}

        <div className="ac-card">
          <div className="ac-card-heading"><Paperclip size={14} /> Pièces jointes ({prestation.attachments.length})</div>
          <AttachmentsPanel
            attachments={prestation.attachments}
            onAdd={handleAddAttachments}
            onRemove={removeAttachment}
            currentUser={currentUser}
            isOffice={false}
          />
        </div>

        <div className="ac-card">
          <div className="ac-card-heading"><Clock size={14} /> Historique récent</div>
          <HistoriqueTimeline history={prestation.history} limit={5} />
        </div>
      </div>
    </motion.div>
  );
}

export default function AgentChantierApp({ currentUser, tasks, projects, materiels, vehicules, getClient, onUpdatePrestation }) {
  const [tab, setTab] = useState("taches");
  const [openId, setOpenId] = useState(null);

  const sortedTasks = useMemo(() => {
    const rank = (t) => (ACTIONABLE_STAGES.includes(t.stage) ? 0 : 1);
    return [...tasks].sort((a, b) => rank(a) - rank(b));
  }, [tasks]);

  const todoTasks = sortedTasks.filter((t) => ACTIONABLE_STAGES.includes(t.stage));
  const otherTasks = sortedTasks.filter((t) => !ACTIONABLE_STAGES.includes(t.stage));

  const openTask = openId ? tasks.find((t) => t.id === openId) : null;
  const todoCount = tasks.filter((t) => ACTIONABLE_STAGES.includes(t.stage)).length;

  const notifications = useMemo(() => buildNotifications(currentUser, { tasks, getClient }), [currentUser, tasks, getClient]);

  return (
    <div className="ac-app">
      <div className="ac-header">
        <div>
          <div className="ac-header-greeting">Bonjour, {currentUser.name}</div>
          <div className="ac-header-sub">
            {todoCount > 0 ? `${todoCount} mission${todoCount > 1 ? "s" : ""} à traiter` : "Rien à traiter pour le moment"}
          </div>
        </div>
        <NotificationBell notifications={notifications} onOpen={(n) => { setOpenId(n.prestationId); setTab("taches"); }} />
      </div>

      <div className="ac-content">
        {tab === "taches" && (
          <div className="ac-tasklist">
            {todoTasks.length > 0 && <div className="ac-section-label ac-section-label-todo">À traiter <b>{todoTasks.length}</b></div>}
            {todoTasks.map((t) => (
              <TaskCard key={t.id} task={t} onOpen={setOpenId} />
            ))}
            {otherTasks.length > 0 && (
              <div className="ac-section-label">{todoTasks.length > 0 ? "Autres missions" : "Missions"} <b>{otherTasks.length}</b></div>
            )}
            {otherTasks.map((t) => (
              <TaskCard key={t.id} task={t} onOpen={setOpenId} />
            ))}
            {sortedTasks.length === 0 && <div className="ac-empty">Aucune mission assignée.</div>}
          </div>
        )}

        {tab === "carte" && (
          <div className="ac-fullpane">
            <MapView
              projects={projects}
              getClient={getClient}
              onOpenProjet={(projetId) => {
                const match = tasks.find((t) => t.projet.id === projetId);
                if (match) setOpenId(match.id);
                setTab("taches");
              }}
            />
          </div>
        )}

        {tab === "planning" && <AgentPlanning tasks={tasks} onOpen={setOpenId} />}
      </div>

      <div className="ac-navbar">
        <button className={`ac-navbtn ${tab === "taches" ? "active" : ""}`} onClick={() => setTab("taches")}>
          <ClipboardList size={20} />
          <span>Mes tâches</span>
        </button>
        <button className={`ac-navbtn ${tab === "carte" ? "active" : ""}`} onClick={() => setTab("carte")}>
          <MapIcon size={20} />
          <span>Carte</span>
        </button>
        <button className={`ac-navbtn ${tab === "planning" ? "active" : ""}`} onClick={() => setTab("planning")}>
          <CalendarDays size={20} />
          <span>Planning</span>
        </button>
      </div>

      <AnimatePresence>
        {openTask && (
          <TaskDetail
            key={openTask.id}
            task={openTask}
            client={getClient(openTask.projet.clientId)}
            materiels={materiels}
            vehicules={vehicules}
            currentUser={currentUser}
            onUpdate={onUpdatePrestation}
            onClose={() => setOpenId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
