import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  MapPin,
  Users,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Clock,
  PauseCircle,
  Lock,
  Truck,
  Wrench,
  Archive,
  Paperclip,
  FileText,
  Plus,
} from "lucide-react";
import { STAGES, NATURES, LIVRABLE_TYPES, RESOURCE_STATUSES, NON_CONFORMITY_SOURCES } from "../constants";
import { today, activeCongeOn, nextBusinessDayFR, splitDateTimeFR, nowTime } from "../utils/dates";
import { canAct } from "../utils/access";
import { bookingsFromProjets, findDraftConflicts } from "../utils/bookings";
import { selectableAgentsByRole } from "../utils/employees";
import { generatePvPdf } from "../utils/pv";
import { vehiculeBlockers } from "../utils/vehicule";
import { notifySuccess, notifyError } from "../utils/notify";
import PipelineStepper from "./PipelineStepper";
import HistoriqueTimeline from "./HistoriqueTimeline";
import AttachmentsPanel from "./AttachmentsPanel";
import { backdropVariants, drawerVariants } from "../lib/motionVariants";
import { DatePicker } from "@/components/ui/date-picker";
import { DateTimeField } from "@/components/ui/datetime-field";

export default function PrestationDrawer({ projet, client, prestation, materiels, vehicules, employees, allProjets, onClose, onUpdate, onOpenMateriel, onOpenVehicule, currentUser, focusTache }) {
  const [natureDemandee, setNatureDemandee] = useState(prestation.natureDemandee);
  const [dateDebutDemande, setDateDebutDemande] = useState(prestation.dateDebutDemande);
  const [dateFinDemande, setDateFinDemande] = useState(prestation.dateFinDemande);

  const [agentChantierSel, setAgentChantierSel] = useState(prestation.agentChantier);
  const [materielSel, setMaterielSel] = useState(prestation.materielIds);
  const [vehiculeId, setVehiculeId] = useState(prestation.vehiculeId);
  const [agentBureau, setAgentBureau] = useState(
    prestation.agentBureau || selectableAgentsByRole(employees, "Agent Bureau")[0]?.nom || ""
  );
  const [agentControle, setAgentControle] = useState(
    prestation.agentControle || selectableAgentsByRole(employees, "Agent Contrôle")[0]?.nom || ""
  );
  const [dateDebutExecPrevue, setDateDebutExecPrevue] = useState(prestation.dateDebutExec);

  // Active-only options for new assignments, but keep whatever is already selected even if
  // that employee has since been deactivated — otherwise an existing assignment silently
  // disappears from its own picker.
  const agentChantierOptions = useMemo(
    () => selectableAgentsByRole(employees, "Agent Chantier", agentChantierSel).map((e) => ({ name: e.nom, role: e.poste })),
    [employees, agentChantierSel]
  );
  const agentBureauOptions = useMemo(
    () => selectableAgentsByRole(employees, "Agent Bureau", [agentBureau]).map((e) => e.nom),
    [employees, agentBureau]
  );
  const agentControleOptions = useMemo(
    () => selectableAgentsByRole(employees, "Agent Contrôle", [agentControle]).map((e) => e.nom),
    [employees, agentControle]
  );

  const [natureExecutee, setNatureExecutee] = useState(prestation.natureExecutee);
  const [dateFinExec, setDateFinExec] = useState(prestation.dateFinExec);
  const [showReprog, setShowReprog] = useState(false);
  const [reprogDate, setReprogDate] = useState("");
  const [reprogMotif, setReprogMotif] = useState("");

  const [refBureau, setRefBureau] = useState(prestation.ref);
  const [tachesSel, setTachesSel] = useState(prestation.taches || []);
  const [tachePreset, setTachePreset] = useState("");
  const [tacheCustom, setTacheCustom] = useState("");
  const [cheminBureau, setCheminBureau] = useState(prestation.cheminBureau);
  const [dateDebutBureau, setDateDebutBureau] = useState(prestation.dateDebutBureau);
  const [dateFinBureau, setDateFinBureau] = useState(prestation.dateFinBureau);
  const [motifInsuffisant, setMotifInsuffisant] = useState("");

  const [dateDebutControle, setDateDebutControle] = useState(prestation.dateDebutControle);
  const [dateFinControle, setDateFinControle] = useState(prestation.dateFinControle);
  const [motifNonConforme, setMotifNonConforme] = useState("");
  const [pvBusy, setPvBusy] = useState(false);
  const [nonConformiteSource, setNonConformiteSource] = useState("");

  const [dateLivraison, setDateLivraison] = useState(prestation.dateLivraison);
  const [chemin, setChemin] = useState(prestation.chemin);
  const [cdN, setCdN] = useState(prestation.cdN);
  const [disqueN, setDisqueN] = useState(prestation.disqueN);

  const REJECTION_PREFIXES = ["Non conforme", "Données insuffisantes"];

  const push = (patch, label) => {
    onUpdate(prestation.id, {
      ...patch,
      history: [...prestation.history, { date: today(), label, author: currentUser.name || currentUser.role }],
    });
    (REJECTION_PREFIXES.some((p) => label.startsWith(p)) ? notifyError : notifySuccess)(label);
  };

  // A non-conformity (from contrôle) or insufficient data (from bureau) sends the prestation
  // back to "execution" with cycles+1. The drawer stays mounted, so without this the exécution
  // form would keep showing the previous (now-rejected) natureExecutee/dateFinExec, letting it
  // be resubmitted unchanged. Only clear on an actual cycles change during this mount, not on
  // first load of an already-cycled prestation.
  const prevCyclesRef = useRef(prestation.cycles);
  useEffect(() => {
    if (prestation.cycles !== prevCyclesRef.current) {
      prevCyclesRef.current = prestation.cycles;
      setNatureExecutee("");
      setDateFinExec("");
    }
  }, [prestation.cycles]);

  const REDO_LABEL_PREFIXES = ["Non conforme", "Données insuffisantes"];
  const lastHistoryEntry = prestation.history[prestation.history.length - 1];
  const isRedo = prestation.cycles > 0 && REDO_LABEL_PREFIXES.some((p) => lastHistoryEntry?.label?.startsWith(p));
  const isNonConformRedo = prestation.stage === "execution" && isRedo;
  const isBureauRedo = prestation.stage === "bureau" && isRedo;

  const toggleChantier = (name) =>
    setAgentChantierSel((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  const toggleMateriel = (id) =>
    setMaterielSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const addTache = (label) => {
    const clean = label.trim();
    if (!clean || tachesSel.some((t) => t.label === clean)) return;
    setTachesSel((prev) => [...prev, { label: clean, agents: agentBureau ? [agentBureau] : [], done: false }]);
  };
  const removeTache = (label) =>
    setTachesSel((prev) => prev.filter((t) => t.label !== label));
  const toggleTacheAgent = (label, name) =>
    setTachesSel((prev) =>
      prev.map((t) =>
        t.label === label
          ? { ...t, agents: t.agents.includes(name) ? t.agents.filter((n) => n !== name) : [...t.agents, name] }
          : t
      )
    );
  const toggleTacheDone = (label) => {
    const updated = tachesSel.map((t) => (t.label === label ? { ...t, done: !t.done } : t));
    setTachesSel(updated);
    const isNowDone = updated.find((t) => t.label === label)?.done;
    push({ taches: updated }, `Tâche ${isNowDone ? "terminée" : "réouverte"} — ${label}`);
  };

  const stage = prestation.stage;
  const allowed = canAct(stage, currentUser);
  const isOffice = currentUser.role === "Dispatcher" || currentUser.role === "Directrice";

  const materielObjs = (prestation.materielIds || []).map((id) => materiels.find((m) => m.id === id)).filter(Boolean);
  const vehiculeObj = vehicules.find((v) => v.id === prestation.vehiculeId);

  const assignmentConflicts = useMemo(() => {
    if (!dateDebutExecPrevue) return [];
    const bookings = bookingsFromProjets(allProjets).filter((b) => b.prestation.dateDebutExec === dateDebutExecPrevue);
    return findDraftConflicts(bookings, { excludePrestationId: prestation.id, vehiculeId, agentNames: agentChantierSel });
  }, [allProjets, dateDebutExecPrevue, vehiculeId, agentChantierSel, prestation.id]);

  const congeConflicts = useMemo(() => {
    if (!dateDebutExecPrevue) return [];
    return agentChantierSel
      .map((name) => {
        const emp = (employees || []).find((e) => e.nom === name);
        const conge = emp && activeCongeOn(emp.conges, dateDebutExecPrevue);
        return conge ? { name, conge } : null;
      })
      .filter(Boolean);
  }, [employees, agentChantierSel, dateDebutExecPrevue]);

  const resourceStatusLabel = (status) => RESOURCE_STATUSES.find((s) => s.key === status)?.label || status;

  const nonOperationalSelections = useMemo(() => {
    const items = [];
    materielSel.forEach((id) => {
      const m = materiels.find((x) => x.id === id);
      if (m && m.status && m.status !== "operationnel") items.push({ nom: m.nom, label: resourceStatusLabel(m.status) });
    });
    if (vehiculeId) {
      const v = vehicules.find((x) => x.id === vehiculeId);
      if (v && v.status && v.status !== "operationnel") items.push({ nom: v.nom, label: resourceStatusLabel(v.status) });
      vehiculeBlockers(v).forEach((p) => items.push({ nom: v.nom, label: `${p.label} expirée (${p.due})` }));
    }
    return items;
  }, [materielSel, vehiculeId, materiels, vehicules]);

  const attachmentDisplayName = (a) => a.name || a.chemin || "—";

  const handleAddAttachments = (newItems) => {
    if (newItems.length === 0) return;
    const label = newItems[0].label;
    push(
      { attachments: [...prestation.attachments, ...newItems] },
      `${label ? `${label} — ` : ""}${newItems.length} pièce${newItems.length > 1 ? "s" : ""} jointe${newItems.length > 1 ? "s" : ""} ajoutée${newItems.length > 1 ? "s" : ""} : ${newItems.map(attachmentDisplayName).join(", ")}`
    );
  };

  const removeAttachment = (index) => {
    const removed = prestation.attachments[index];
    push(
      { attachments: prestation.attachments.filter((_, i) => i !== index) },
      `Pièce jointe supprimée : ${removed?.label ? `${removed.label} — ` : ""}${attachmentDisplayName(removed || {})}`
    );
  };

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-drawer" onClick={(e) => e.stopPropagation()} variants={drawerVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div>
            <div className="gt-mono gt-drawer-id">{prestation.id} · {projet.id}</div>
            <div className="gt-drawer-client">{client?.nom || "—"}</div>
            {focusTache && <div className="gt-drawer-focustag">Tâche : {focusTache}</div>}
          </div>
          <button className="gt-iconbtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="gt-drawer-meta">
          <span className="gt-chip">
            <MapPin size={12} /> {projet.situation}
          </span>
          <span className="gt-chip">Réf. foncière : {projet.referenceFonciere}</span>
          <span className="gt-chip">Client : {client?.id || "—"}</span>
          {!allowed && (
            <span className="gt-chip" style={{ borderColor: "var(--muted)" }}>
              <Lock size={11} /> Lecture seule pour votre rôle
            </span>
          )}
        </div>

        <div className="gt-drawer-pipeline">
          <PipelineStepper stage={stage} cycles={prestation.cycles} />
        </div>

        {prestation.natureExecutee && (
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 20px 0" }}>
            <button
              className="gt-btn gt-btn-neutral"
              style={{ marginTop: 0 }}
              disabled={pvBusy}
              onClick={async () => {
                setPvBusy(true);
                try {
                  await generatePvPdf({ projet, client, prestation, materiels, vehicules });
                  notifySuccess("PV généré");
                } catch {
                  notifyError("Le PV n'a pas pu être généré.");
                } finally {
                  setPvBusy(false);
                }
              }}
            >
              <FileText size={14} /> {pvBusy ? "Génération…" : "Générer le PV"}
            </button>
          </div>
        )}

        <div className="gt-drawer-body">
          <section className="gt-section">
            <h4>Étape en cours — {STAGES.find((s) => s.key === stage).label}</h4>

            {stage === "demande" && (
              allowed ? (
                <div className="gt-form">
                  <label>Nature de la prestation demandée</label>
                  <select value={natureDemandee} onChange={(e) => setNatureDemandee(e.target.value)}>
                    <option value="">— choisir —</option>
                    {NATURES.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <div className="gt-formrow">
                    <div style={{ flex: 1 }}>
                      <label>Date début</label>
                      <DatePicker value={dateDebutDemande} onChange={setDateDebutDemande} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Date fin prévue</label>
                      <DatePicker value={dateFinDemande} onChange={setDateFinDemande} />
                    </div>
                  </div>
                  <button
                    className="gt-btn gt-btn-primary"
                    disabled={!natureDemandee || !dateDebutDemande}
                    onClick={() =>
                      push(
                        { stage: "prestation", natureDemandee, dateDebutDemande, dateFinDemande },
                        `Prestation définie — ${natureDemandee}`
                      )
                    }
                  >
                    Valider la prestation demandée <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="gt-readonly gt-restricted"><Lock size={12} /> Réservé au bureau (Dispatcher/Directrice)</div>
              )
            )}

            {stage === "prestation" && (
              allowed ? (
                <div className="gt-form">
                  <div className="gt-readonly">
                    <div className="gt-mono">{prestation.natureDemandee}</div>
                    <div>Demandé du {prestation.dateDebutDemande} au {prestation.dateFinDemande || "—"}</div>
                  </div>
                  <label>Agent(s) chantier</label>
                  <div className="gt-teamgrid">
                    {agentChantierOptions.map((t) => (
                      <label key={t.name} className={`gt-teampick ${agentChantierSel.includes(t.name) ? "active" : ""}`}>
                        <input type="checkbox" checked={agentChantierSel.includes(t.name)} onChange={() => toggleChantier(t.name)} />
                        <span className="gt-teampick-name">{t.name}</span>
                        <span className="gt-teampick-role">{t.role}</span>
                      </label>
                    ))}
                  </div>
                  <label>Matériel utilisé</label>
                  <div className="gt-teamgrid">
                    {materiels.map((m) => (
                      <label key={m.id} className={`gt-teampick ${materielSel.includes(m.id) ? "active" : ""}`}>
                        <input type="checkbox" checked={materielSel.includes(m.id)} onChange={() => toggleMateriel(m.id)} />
                        <span className="gt-teampick-name">{m.nom}</span>
                        {m.status && m.status !== "operationnel" && (
                          <span className="gt-teampick-status" style={{ color: "var(--bad)" }}>{resourceStatusLabel(m.status)}</span>
                        )}
                      </label>
                    ))}
                  </div>
                  <label>Véhicule</label>
                  <select value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)}>
                    <option value="">— choisir —</option>
                    {vehicules.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nom}{v.status && v.status !== "operationnel" ? ` — ${resourceStatusLabel(v.status)}` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="gt-formrow">
                    <div style={{ flex: 1 }}>
                      <label>Agent bureau (traitement)</label>
                      <select value={agentBureau} onChange={(e) => setAgentBureau(e.target.value)}>
                        {agentBureauOptions.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Agent contrôle</label>
                      <select value={agentControle} onChange={(e) => setAgentControle(e.target.value)}>
                        {agentControleOptions.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label>Date de visite prévue</label>
                  <DatePicker value={dateDebutExecPrevue} onChange={setDateDebutExecPrevue} />

                  {assignmentConflicts.length > 0 && (
                    <div className="gt-conflict-warning">
                      <div className="gt-conflict-title">
                        <AlertTriangle size={13} /> {assignmentConflicts.length} conflit{assignmentConflicts.length > 1 ? "s" : ""} de réservation le {dateDebutExecPrevue}
                      </div>
                      <ul className="gt-conflict-list">
                        {assignmentConflicts.map((c, i) => (
                          <li key={i}>
                            {c.type === "vehicule"
                              ? `Véhicule déjà affecté à ${c.prestation.id} (${c.projet.id})`
                              : `${c.agentName} déjà affecté à ${c.prestation.id} (${c.projet.id})`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {congeConflicts.length > 0 && (
                    <div className="gt-conflict-warning">
                      <div className="gt-conflict-title">
                        <AlertTriangle size={13} /> {congeConflicts.length} agent{congeConflicts.length > 1 ? "s" : ""} en congé approuvé le {dateDebutExecPrevue}
                      </div>
                      <ul className="gt-conflict-list">
                        {congeConflicts.map((c, i) => (
                          <li key={i}>{c.name} — {c.conge.type} du {c.conge.dateDebut} au {c.conge.dateFin}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {nonOperationalSelections.length > 0 && (
                    <div className="gt-conflict-warning">
                      <div className="gt-conflict-title">
                        <AlertTriangle size={13} /> Ressource{nonOperationalSelections.length > 1 ? "s" : ""} à vérifier avant l'affectation
                      </div>
                      <ul className="gt-conflict-list">
                        {nonOperationalSelections.map((r, i) => (
                          <li key={i}>{r.nom} — {r.label}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    className="gt-btn gt-btn-primary"
                    disabled={agentChantierSel.length === 0 || !dateDebutExecPrevue}
                    onClick={() =>
                      push(
                        {
                          stage: "affectation",
                          agentChantier: agentChantierSel,
                          materielIds: materielSel,
                          vehiculeId,
                          agentBureau,
                          agentControle,
                          dateDebutExec: dateDebutExecPrevue,
                        },
                        `Affectation : ${agentChantierSel.join(", ")} — visite prévue le ${dateDebutExecPrevue}`
                      )
                    }
                  >
                    Affecter les ressources <ChevronRight size={14} />
                  </button>
                </div>
              ) : (
                <div className="gt-readonly gt-restricted"><Lock size={12} /> Réservé au bureau (Dispatcher/Directrice)</div>
              )
            )}

            {stage === "affectation" && (
              <div className="gt-form">
                <div className="gt-readonly">
                  <div><Users size={12} style={{ verticalAlign: -2 }} /> {prestation.agentChantier.join(", ")}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Wrench size={12} />
                    {materielObjs.length === 0 && "—"}
                    {materielObjs.map((m) => (
                      <button
                        key={m.id}
                        className={onOpenMateriel ? "gt-inline-link" : "gt-inline-text"}
                        onClick={onOpenMateriel ? () => onOpenMateriel(m.id) : undefined}
                      >
                        {m.nom}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Truck size={12} />
                    {vehiculeObj ? (
                      <button
                        className={onOpenVehicule ? "gt-inline-link" : "gt-inline-text"}
                        onClick={onOpenVehicule ? () => onOpenVehicule(vehiculeObj.id) : undefined}
                      >
                        {vehiculeObj.nom}
                      </button>
                    ) : "—"}
                  </div>
                  <div>Visite prévue le {prestation.dateDebutExec}</div>
                </div>
                {allowed ? (
                  <button
                    className="gt-btn gt-btn-primary"
                    onClick={() => push({ stage: "execution" }, `Passage à l'exécution — visite du ${prestation.dateDebutExec}`)}
                  >
                    Démarrer l'exécution <ChevronRight size={14} />
                  </button>
                ) : (
                  <div className="gt-readonly gt-restricted"><Lock size={12} /> En attente de l'agent chantier assigné</div>
                )}
              </div>
            )}

            {stage === "execution" && (
              allowed ? (
                <div className="gt-form">
                  {prestation.reprogramme && (
                    <div className="gt-readonly" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>
                      Visite précédente inachevée — reprise prévue le {prestation.dateDebutExec}
                    </div>
                  )}
                  {isNonConformRedo && (
                    <div className="gt-readonly gt-restricted" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
                      <AlertTriangle size={12} /> Renvoyé en exécution — {lastHistoryEntry.label.replace(/^(Non conforme|Données insuffisantes) — /, "")}. Une nouvelle exécution est requise.
                    </div>
                  )}
                  <label>Prestation réellement exécutée</label>
                  <textarea value={natureExecutee} onChange={(e) => setNatureExecutee(e.target.value)} rows={2} placeholder="Ce qui a été fait sur le terrain..." />
                  <label>Date et heure de fin d'exécution</label>
                  <DateTimeField value={dateFinExec} onChange={setDateFinExec} />
                  <button
                    className="gt-btn gt-btn-primary"
                    disabled={!natureExecutee || !dateFinExec}
                    onClick={() =>
                      push(
                        { stage: "bureau", natureExecutee, dateFinExec, reprogramme: false },
                        `Exécution saisie — ${natureExecutee}`
                      )
                    }
                  >
                    Envoyer au bureau <ChevronRight size={14} />
                  </button>

                  {prestation.reprogramme ? (
                    <div className="gt-readonly">
                      <PauseCircle size={12} style={{ verticalAlign: -2 }} /> Reprise déjà programmée — terminez cette visite avant d'en signaler une autre.
                    </div>
                  ) : !showReprog ? (
                    <button
                      className="gt-btn gt-btn-neutral"
                      onClick={() => {
                        const { timePart } = splitDateTimeFR(dateFinExec);
                        setReprogDate(`${nextBusinessDayFR(prestation.dateDebutExec)} ${timePart || nowTime()}`);
                        setShowReprog(true);
                      }}
                    >
                      <PauseCircle size={14} /> Mission non terminée — reprogrammer
                    </button>
                  ) : (
                    <div className="gt-reprogbox">
                      <label>Pourquoi la mission n'est pas terminée</label>
                      <textarea
                        value={reprogMotif}
                        onChange={(e) => setReprogMotif(e.target.value)}
                        rows={2}
                        placeholder="Ce qui a bloqué / reste à faire..."
                      />
                      <label>Nouvelle date de visite proposée <span className="gt-hint">(suggestion — le dispatcher peut la modifier)</span></label>
                      <DateTimeField value={reprogDate} onChange={setReprogDate} todayLabel="Maintenant" />
                      <button
                        className="gt-btn gt-btn-primary"
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
                        Reprogrammer <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="gt-readonly gt-restricted">
                  <Lock size={12} /> Réservé à l'agent chantier assigné
                  {prestation.reprogramme && <div style={{ marginTop: 6 }}>Reprise prévue le {prestation.dateDebutExec}</div>}
                  {isNonConformRedo && (
                    <div style={{ marginTop: 6, color: "var(--bad)" }}>
                      Renvoyé — {lastHistoryEntry.label.replace(/^(Non conforme|Données insuffisantes) — /, "")}. Nouvelle exécution requise.
                    </div>
                  )}
                </div>
              )
            )}

            {stage === "bureau" && (
              (allowed || isOffice) ? (
                <div className="gt-form">
                  {isBureauRedo && (
                    <div className="gt-readonly gt-restricted" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
                      <AlertTriangle size={12} /> Renvoyé par le contrôle — {lastHistoryEntry.label.replace(/^(Non conforme|Données insuffisantes) — /, "")}. Un nouveau traitement est requis.
                    </div>
                  )}
                  <div className="gt-readonly">{prestation.natureExecutee}</div>
                  <div className="gt-readonly">
                    <Clock size={12} style={{ verticalAlign: -2 }} /> Visite terrain le {prestation.dateDebutExec}{prestation.dateFinExec ? ` → ${prestation.dateFinExec}` : ""}
                  </div>
                  <label>Tâches de traitement</label>
                  {tachesSel.length > 0 && (
                    <div className="gt-progressbar-wrap">
                      <div className="gt-progressbar">
                        <div className="gt-progressbar-fill" style={{ width: `${(tachesSel.filter((t) => t.done).length / tachesSel.length) * 100}%` }} />
                      </div>
                      <span className="gt-progressbar-label">{tachesSel.filter((t) => t.done).length}/{tachesSel.length} tâches complètes</span>
                    </div>
                  )}
                  {isOffice ? (
                    <div className="gt-tacheslist">
                      {tachesSel.map((tache) => (
                        <div className="gt-tache-row" key={tache.label}>
                          <div className="gt-tache-rowhead">
                            <label className="gt-tache-donepick">
                              <input type="checkbox" checked={!!tache.done} onChange={() => toggleTacheDone(tache.label)} />
                            </label>
                            <span className={`gt-tache-label ${tache.done ? "done" : ""}`}>{tache.label}</span>
                            <button type="button" className="gt-iconbtn" onClick={() => removeTache(tache.label)}>
                              <X size={13} />
                            </button>
                          </div>
                          <div className="gt-tache-agents">
                            {agentBureauOptions.map((name) => (
                              <label key={name} className={`gt-tache-agentpick ${tache.agents.includes(name) ? "active" : ""}`}>
                                <input type="checkbox" checked={tache.agents.includes(name)} onChange={() => toggleTacheAgent(tache.label, name)} />
                                {name}
                              </label>
                            ))}
                            {tache.agents.length === 0 && (
                              <span className="gt-tache-warn">
                                <AlertTriangle size={11} /> Choisir au moins un agent
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {tachesSel.length === 0 && (
                        <div className="gt-list-empty">Aucune tâche ajoutée pour l'instant.</div>
                      )}

                      <div className="gt-tache-addrow">
                        <select
                          value={tachePreset}
                          onChange={(e) => {
                            setTachePreset(e.target.value);
                            if (e.target.value) {
                              addTache(e.target.value);
                              setTachePreset("");
                            }
                          }}
                        >
                          <option value="">+ Ajouter une tâche type…</option>
                          {LIVRABLE_TYPES.filter((label) => !tachesSel.some((t) => t.label === label)).map((label) => (
                            <option key={label} value={label}>{label}</option>
                          ))}
                        </select>
                        <div className="gt-tache-customadd">
                          <input
                            value={tacheCustom}
                            onChange={(e) => setTacheCustom(e.target.value)}
                            placeholder="Ou saisir une tâche personnalisée..."
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addTache(tacheCustom);
                                setTacheCustom("");
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="gt-btn gt-btn-neutral"
                            disabled={!tacheCustom.trim()}
                            onClick={() => {
                              addTache(tacheCustom);
                              setTacheCustom("");
                            }}
                          >
                            <Plus size={14} /> Ajouter
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : tachesSel.length === 0 ? (
                    <div className="gt-readonly gt-restricted">
                      <Lock size={12} /> En attente de l'affectation des tâches par le Dispatcher/Directrice
                    </div>
                  ) : (
                    (() => {
                      const focused = focusTache && tachesSel.find((t) => t.label === focusTache);
                      const others = focused ? tachesSel.filter((t) => t.label !== focusTache) : tachesSel;
                      const row = (t) => (
                        <div className="gt-tache-readrow" key={t.label}>
                          <label className="gt-tache-donepick">
                            <input type="checkbox" checked={!!t.done} onChange={() => toggleTacheDone(t.label)} />
                          </label>
                          <span className={`gt-tache-readlabel ${t.done ? "done" : ""}`}>{t.label}</span>
                          <span className="gt-tache-readagents">{t.agents.join(", ") || "—"}</span>
                        </div>
                      );
                      return (
                        <>
                          {focused && (
                            <div className="gt-tache-hero">
                              <div className="gt-tache-hero-eyebrow">Tâche sélectionnée</div>
                              <div className="gt-tache-hero-row">
                                <span className={`gt-tache-hero-label ${focused.done ? "done" : ""}`}>{focused.label}</span>
                                <button
                                  type="button"
                                  className={`gt-btn ${focused.done ? "gt-btn-neutral" : "gt-btn-primary"}`}
                                  onClick={() => toggleTacheDone(focused.label)}
                                >
                                  <CheckCircle2 size={14} /> {focused.done ? "Rouvrir la tâche" : "Marquer terminée"}
                                </button>
                              </div>
                              <div className="gt-tache-hero-agents">
                                <Users size={12} /> {focused.agents.join(", ") || "Aucun agent assigné"}
                              </div>
                            </div>
                          )}
                          {others.length > 0 && (
                            <>
                              {focused && <div className="gt-tache-otherslabel">Autres tâches du dossier</div>}
                              <div className="gt-tacheslist-readonly">{others.map(row)}</div>
                            </>
                          )}
                        </>
                      );
                    })()
                  )}

                  {isOffice && (
                    <>
                      <label>Chemin du dossier de traitement <span className="gt-hint">(facultatif — pré-remplir pour l'agent bureau)</span></label>
                      <input value={cheminBureau} onChange={(e) => setCheminBureau(e.target.value)} placeholder="\\SERVEUR\Traitement\..." className="gt-mono" />
                      <button
                        type="button"
                        className="gt-btn gt-btn-neutral"
                        disabled={tachesSel.length === 0 || tachesSel.some((t) => t.agents.length === 0)}
                        onClick={() =>
                          push(
                            { taches: tachesSel, cheminBureau },
                            `Tâches affectées — ${tachesSel.map((t) => t.label).join(", ")}`
                          )
                        }
                      >
                        Enregistrer l'affectation des tâches
                      </button>
                    </>
                  )}

                  {(prestation.taches || []).length > 0 && (
                    allowed ? (
                      <>
                        <div className="gt-formrow">
                          <div style={{ flex: 1 }}>
                            <label>Date début traitement</label>
                            <DatePicker value={dateDebutBureau} onChange={setDateDebutBureau} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label>Date fin traitement</label>
                            <DatePicker value={dateFinBureau} onChange={setDateFinBureau} />
                          </div>
                        </div>
                        <label>Référence du livrable</label>
                        <input value={refBureau} onChange={(e) => setRefBureau(e.target.value)} placeholder="ex. LIV-0134" />
                        <label>Chemin du dossier de traitement</label>
                        <input value={cheminBureau} onChange={(e) => setCheminBureau(e.target.value)} placeholder="\\SERVEUR\Traitement\..." className="gt-mono" />
                        <button
                          className="gt-btn gt-btn-primary"
                          disabled={tachesSel.length === 0 || tachesSel.some((t) => t.agents.length === 0) || !refBureau.trim()}
                          onClick={() =>
                            push(
                              { stage: "controle", ref: refBureau, taches: tachesSel, cheminBureau, dateDebutBureau, dateFinBureau },
                              `Traitement bureau terminé — ${tachesSel.map((t) => t.label).join(", ")}`
                            )
                          }
                        >
                          Envoyer au contrôle <ChevronRight size={14} />
                        </button>

                        <div className="gt-reprogbox" style={{ borderColor: "var(--bad)", background: "#FBEBE8" }}>
                          <label>Données insuffisantes — motif</label>
                          <textarea
                            value={motifInsuffisant}
                            onChange={(e) => setMotifInsuffisant(e.target.value)}
                            rows={2}
                            placeholder="Ce qui manque ou doit être repris sur le terrain..."
                          />
                          <button
                            className="gt-btn gt-btn-bad"
                            disabled={!motifInsuffisant.trim()}
                            onClick={() =>
                              push(
                                { stage: "execution", cycles: prestation.cycles + 1 },
                                `Données insuffisantes — ${motifInsuffisant}. Retour à Exécution.`
                              )
                            }
                          >
                            <AlertTriangle size={14} /> Retour terrain
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="gt-readonly">
                        <div className="gt-mono">Début {dateDebutBureau || "—"} · Fin {dateFinBureau || "—"}</div>
                        <div className="gt-mono">Réf. livrable {refBureau || "—"}</div>
                        {cheminBureau && <div className="gt-mono">{cheminBureau}</div>}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="gt-readonly gt-restricted">
                  <Lock size={12} /> Réservé à l'agent bureau assigné ({prestation.agentBureau})
                  {prestation.natureExecutee && <div className="gt-mono" style={{ marginTop: 6 }}>{prestation.natureExecutee}</div>}
                </div>
              )
            )}

            {stage === "controle" && (
              allowed ? (
                <div className="gt-form">
                  <div className="gt-readonly">{prestation.natureExecutee}</div>
                  <div className="gt-readonly">
                    <div className="gt-mono">Réf. livrable {prestation.ref || "—"}</div>
                    {prestation.cheminBureau && <div className="gt-mono">{prestation.cheminBureau}</div>}
                  </div>
                  <div className="gt-formrow">
                    <div style={{ flex: 1 }}>
                      <label>Date début contrôle</label>
                      <DatePicker value={dateDebutControle} onChange={setDateDebutControle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Date fin contrôle</label>
                      <DatePicker value={dateFinControle} onChange={setDateFinControle} />
                    </div>
                  </div>
                  <label>Motif (si non conforme)</label>
                  <textarea value={motifNonConforme} onChange={(e) => setMotifNonConforme(e.target.value)} rows={2} />
                  <label>Origine de la non-conformité (si non conforme)</label>
                  <select value={nonConformiteSource} onChange={(e) => setNonConformiteSource(e.target.value)}>
                    <option value="">— choisir —</option>
                    {NON_CONFORMITY_SOURCES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                  <div className="gt-btnrow">
                    <button
                      className="gt-btn gt-btn-good"
                      onClick={() => push({ stage: "livraison", dateDebutControle, dateFinControle }, "Contrôle conforme")}
                    >
                      <CheckCircle2 size={14} /> Conforme
                    </button>
                    <button
                      className="gt-btn gt-btn-bad"
                      disabled={!motifNonConforme || !nonConformiteSource}
                      onClick={() => {
                        const sourceInfo = NON_CONFORMITY_SOURCES.find((s) => s.key === nonConformiteSource);
                        const targetStage = nonConformiteSource === "bureau" ? "bureau" : "execution";
                        const targetLabel = targetStage === "bureau" ? "Traitement bureau" : "Exécution";
                        push(
                          { stage: targetStage, dateDebutControle, dateFinControle, cycles: prestation.cycles + 1, nonConformiteSource },
                          `Non conforme — [${sourceInfo.label}] ${motifNonConforme}. Retour à ${targetLabel}.`
                        );
                      }}
                    >
                      <AlertTriangle size={14} /> Non conforme
                    </button>
                  </div>
                </div>
              ) : (
                <div className="gt-readonly gt-restricted">
                  <Lock size={12} /> Réservé à l'agent contrôle assigné ({prestation.agentControle})
                  <div className="gt-mono" style={{ marginTop: 6 }}>Réf. livrable {prestation.ref || "—"}</div>
                  {prestation.cheminBureau && <div className="gt-mono">{prestation.cheminBureau}</div>}
                </div>
              )
            )}

            {stage === "livraison" && (
              allowed ? (
                prestation.chemin && prestation.dateLivraison ? (
                  <div className="gt-readonly">
                    <div className="gt-mono">Livré le {prestation.dateLivraison} — Réf {prestation.ref}</div>
                    <div className="gt-mono">{prestation.chemin}</div>
                    <div className="gt-mono">CD {prestation.cdN} · Disque {prestation.disqueN}</div>
                  </div>
                ) : (
                  <div className="gt-form">
                    <div className="gt-readonly">
                      <div className="gt-mono">Réf. livrable {prestation.ref || "—"}</div>
                      {prestation.cheminBureau && <div className="gt-mono">{prestation.cheminBureau}</div>}
                    </div>
                    <label>Date de livraison</label>
                    <DatePicker value={dateLivraison} onChange={setDateLivraison} />
                    <label>Chemin réseau</label>
                    <input value={chemin} onChange={(e) => setChemin(e.target.value)} placeholder="\\SERVEUR\Projets\..." />
                    <div className="gt-formrow">
                      <div style={{ flex: 1 }}>
                        <label>CD N°</label>
                        <input value={cdN} onChange={(e) => setCdN(e.target.value)} placeholder="CD-0123" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label>Disque N°</label>
                        <input value={disqueN} onChange={(e) => setDisqueN(e.target.value)} placeholder="DQ-045" />
                      </div>
                    </div>
                    <button
                      className="gt-btn gt-btn-primary"
                      disabled={!dateLivraison || !chemin}
                      onClick={() => push({ dateLivraison, chemin, cdN, disqueN }, `Livré — Réf ${prestation.ref || "—"}`)}
                    >
                      <Archive size={14} /> Archiver et clôturer
                    </button>
                  </div>
                )
              ) : (
                <div className="gt-readonly gt-restricted">
                  <Lock size={12} /> Réservé au bureau (Dispatcher/Directrice)
                  <div className="gt-mono" style={{ marginTop: 6 }}>Réf. livrable {prestation.ref || "—"}</div>
                  {prestation.cheminBureau && <div className="gt-mono">{prestation.cheminBureau}</div>}
                </div>
              )
            )}
          </section>

          <section className="gt-section">
            <h4>
              <Paperclip size={13} strokeWidth={2.2} /> Pièces jointes ({prestation.attachments.length})
            </h4>
            <AttachmentsPanel
              attachments={prestation.attachments}
              onAdd={handleAddAttachments}
              onRemove={removeAttachment}
              currentUser={currentUser}
              isOffice={isOffice}
            />
          </section>

          <section className="gt-section">
            <h4>
              <Clock size={13} strokeWidth={2.2} /> Historique
            </h4>
            <HistoriqueTimeline history={prestation.history} />
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}
