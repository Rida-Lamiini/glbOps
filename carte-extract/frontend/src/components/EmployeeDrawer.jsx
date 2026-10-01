import React, { useState } from "react";
import DrawerTabs from "./DrawerTabs";
import { motion } from "framer-motion";
import { X, Check, Pencil, UserRound, Palmtree, Phone, Mail, Plus, Trash2 , ListChecks } from "lucide-react";
import { STAGES, STAGE_COLORS, EMPLOYEE_STATUSES, CONGE_TYPES, CONGE_STATUSES, ROLES } from "../constants";
import { computeEmployeeStats } from "../utils/stats";
import { today, activeCongeOn } from "../utils/dates";
import { notifySuccess } from "../utils/notify";
import { backdropVariants, drawerVariants } from "../lib/motionVariants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";

export default function EmployeeDrawer({
  item,
  projects,
  onClose,
  onOpenPrestation,
  onRenameItem,
  onEditItem,
  onAddConge,
  onUpdateCongeStatut,
  onRemoveConge,
  isOffice,
}) {
  const [tab, setTab] = useState("profil");
  const [renaming, setRenaming] = useState(false);
  const [nomDraft, setNomDraft] = useState(item.nom);
  const [editing, setEditing] = useState(false);
  const [roleDraft, setRoleDraft] = useState(item.role);
  const [posteDraft, setPosteDraft] = useState(item.poste || "");
  const [telDraft, setTelDraft] = useState(item.telephone || "");
  const [emailDraft, setEmailDraft] = useState(item.email || "");
  const [embaucheDraft, setEmbaucheDraft] = useState(item.dateEmbauche || "");
  const [statusDraft, setStatusDraft] = useState(item.status || "actif");
  const [showCongeForm, setShowCongeForm] = useState(false);
  const [congeType, setCongeType] = useState(CONGE_TYPES[0]);
  const [congeDebut, setCongeDebut] = useState(today());
  const [congeFin, setCongeFin] = useState(today());
  const [congeMotif, setCongeMotif] = useState("");

  const stats = computeEmployeeStats(item, projects);
  const statusInfo = EMPLOYEE_STATUSES.find((s) => s.key === (item.status || "actif"));
  const onLeave = activeCongeOn(item.conges, today());
  const conges = item.conges || [];

  const submitRename = () => {
    if (nomDraft.trim()) {
      onRenameItem(item.id, nomDraft.trim());
      notifySuccess("Employé renommé");
    }
    setRenaming(false);
  };

  const startEdit = () => {
    setRoleDraft(item.role);
    setPosteDraft(item.poste || "");
    setTelDraft(item.telephone || "");
    setEmailDraft(item.email || "");
    setEmbaucheDraft(item.dateEmbauche || "");
    setStatusDraft(item.status || "actif");
    setEditing(true);
  };

  const submitEdit = () => {
    onEditItem(item.id, {
      role: roleDraft,
      poste: posteDraft.trim(),
      telephone: telDraft.trim(),
      email: emailDraft.trim(),
      dateEmbauche: embaucheDraft,
      status: statusDraft,
    });
    notifySuccess("Fiche employé mise à jour");
    setEditing(false);
  };

  const submitConge = () => {
    onAddConge(item.id, {
      type: congeType,
      dateDebut: congeDebut,
      dateFin: congeFin,
      statut: "en_attente",
      motif: congeMotif.trim(),
    });
    setCongeType(CONGE_TYPES[0]);
    setCongeDebut(today());
    setCongeFin(today());
    setCongeMotif("");
    setShowCongeForm(false);
    notifySuccess("Demande de congé enregistrée");
  };

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-drawer" onClick={(e) => e.stopPropagation()} variants={drawerVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div className="gt-resource-icon">
              <UserRound size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="gt-mono gt-drawer-id">{item.id} · {item.role}</div>
              {renaming ? (
                <div className="gt-renamebox">
                  <input value={nomDraft} onChange={(e) => setNomDraft(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && submitRename()} />
                  <button className="gt-iconbtn" onClick={submitRename}>
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <div className="gt-drawer-client">
                  {item.nom}
                  {isOffice && (
                    <button className="gt-iconbtn gt-rename-btn" onClick={() => { setNomDraft(item.nom); setRenaming(true); }}>
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <button className="gt-iconbtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="gt-drawer-meta">
          <span className="gt-chip">{stats.nbUsageTotal} affectation{stats.nbUsageTotal > 1 ? "s" : ""}</span>
          <span className="gt-chip" style={stats.enCours > 0 ? { borderColor: "var(--amber)", color: "var(--amber)" } : undefined}>
            {stats.enCours} en cours
          </span>
          {statusInfo && (
            <Badge variant="outline" style={{ borderColor: statusInfo.color, color: statusInfo.color }}>
              {statusInfo.label}
            </Badge>
          )}
          {onLeave && (
            <Badge variant="outline" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>
              <Palmtree size={11} /> En congé jusqu'au {onLeave.dateFin}
            </Badge>
          )}
        </div>

        <DrawerTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "profil", label: "Profil", icon: UserRound },
            { key: "conges", label: "Congés", icon: Palmtree, count: conges.length },
            { key: "affectations", label: "Affectations", icon: ListChecks, count: stats.assignments.length },
          ]}
        />

        <div className="gt-drawer-body" role="tabpanel">
          {tab === "profil" && (
          <section className="gt-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h4 style={{ margin: 0 }}><UserRound size={13} strokeWidth={2.2} /> Profil</h4>
              {isOffice && !editing && (
                <button className="gt-iconbtn" onClick={startEdit}>
                  <Pencil size={13} />
                </button>
              )}
            </div>
            {!editing ? (
              <div className="gt-resource-grid" style={{ marginTop: 8 }}>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">Poste</span>
                  <span>{item.poste || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">Rôle</span>
                  <span>{item.role}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label"><Phone size={10} /> Téléphone</span>
                  <span className="gt-mono">{item.telephone || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label"><Mail size={10} /> Email</span>
                  <span>{item.email || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">Date d'embauche</span>
                  <span>{item.dateEmbauche || "—"}</span>
                </div>
              </div>
            ) : (
              <div className="gt-form" style={{ marginTop: 8 }}>
                <Label>Poste</Label>
                <Input value={posteDraft} onChange={(e) => setPosteDraft(e.target.value)} placeholder="ex. Topographe" />
                <Label>Rôle (accès application)</Label>
                <select value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)}>
                  {ROLES.filter((r) => r !== "Dispatcher" && r !== "Directrice").map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <div className="gt-formrow">
                  <div style={{ flex: 1 }}>
                    <Label>Téléphone</Label>
                    <Input value={telDraft} onChange={(e) => setTelDraft(e.target.value)} placeholder="06 XX XX XX XX" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>Email</Label>
                    <Input value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="prenom.nom@globetudes.ma" />
                  </div>
                </div>
                <Label>Date d'embauche</Label>
                <DatePicker value={embaucheDraft} onChange={setEmbaucheDraft} />
                <Label>Statut</Label>
                <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
                  {EMPLOYEE_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                <div className="gt-btnrow">
                  <Button onClick={submitEdit} className="bg-[var(--accent)] text-white hover:opacity-90">
                    <Check size={14} /> Enregistrer
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </section>
          )}

          {tab === "conges" && (
          <section className="gt-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h4 style={{ margin: 0 }}><Palmtree size={13} strokeWidth={2.2} /> Congés ({conges.length})</h4>
              {isOffice && !showCongeForm && (
                <button className="gt-iconbtn" onClick={() => setShowCongeForm(true)}>
                  <Plus size={15} />
                </button>
              )}
            </div>

            <div className="gt-projet-prestations" style={{ marginTop: 8 }}>
              {conges.slice().reverse().map((c) => {
                const st = CONGE_STATUSES.find((s) => s.key === c.statut);
                return (
                  <div className="gt-listrow" key={c.id} style={{ cursor: "default" }}>
                    <div className="gt-listrow-info">
                      <div className="gt-mono gt-listrow-id">{c.dateDebut} → {c.dateFin}</div>
                      <div className="gt-listrow-client">{c.type}{c.motif ? ` — ${c.motif}` : ""}</div>
                    </div>
                    <Badge variant="outline" style={{ borderColor: st?.color, color: st?.color }}>
                      {st?.label}
                    </Badge>
                    {isOffice && c.statut === "en_attente" && (
                      <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                        <button
                          className="gt-iconbtn"
                          title="Approuver"
                          onClick={() => { onUpdateCongeStatut(item.id, c.id, "approuve"); notifySuccess("Congé approuvé"); }}
                          style={{ color: "var(--good)" }}
                        >
                          <Check size={15} />
                        </button>
                        <button
                          className="gt-iconbtn"
                          title="Refuser"
                          onClick={() => { onUpdateCongeStatut(item.id, c.id, "refuse"); notifySuccess("Congé refusé"); }}
                          style={{ color: "var(--bad)" }}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}
                    {isOffice && (
                      <button className="gt-iconbtn" title="Supprimer" onClick={() => { onRemoveConge(item.id, c.id); notifySuccess("Congé supprimé"); }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
              {conges.length === 0 && <div className="gt-list-empty">Aucun congé enregistré.</div>}
            </div>

            {showCongeForm && (
              <div className="gt-reprogbox" style={{ marginTop: 10 }}>
                <div className="gt-formrow">
                  <div style={{ flex: 1 }}>
                    <label>Du</label>
                    <DatePicker value={congeDebut} onChange={setCongeDebut} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Au</label>
                    <DatePicker value={congeFin} onChange={setCongeFin} />
                  </div>
                </div>
                <label>Type</label>
                <select value={congeType} onChange={(e) => setCongeType(e.target.value)}>
                  {CONGE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <label>Motif (facultatif)</label>
                <input value={congeMotif} onChange={(e) => setCongeMotif(e.target.value)} placeholder="ex. Mariage, examen médical..." />
                <div className="gt-btnrow">
                  <button className="gt-btn gt-btn-primary" onClick={submitConge}>
                    Enregistrer la demande
                  </button>
                  <button className="gt-btn gt-btn-neutral" onClick={() => setShowCongeForm(false)}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </section>
          )}

          {tab === "affectations" && (
          <section className="gt-section">
            <h4>Affectations ({stats.assignments.length})</h4>
            <div className="gt-projet-prestations">
              {stats.assignments.map(({ prestation, projet }) => (
                <button className="gt-listrow" key={prestation.id} onClick={() => onOpenPrestation(prestation.id)}>
                  <div className="gt-listrow-info">
                    <div className="gt-mono gt-listrow-id">{prestation.id} · {projet.id}</div>
                    <div className="gt-listrow-client">{prestation.natureDemandee || "Non définie"}</div>
                  </div>
                  <div className="gt-listrow-stage" style={{ color: STAGE_COLORS[prestation.stage] }}>
                    {STAGES.find((s) => s.key === prestation.stage).label}
                  </div>
                </button>
              ))}
              {stats.assignments.length === 0 && <div className="gt-list-empty">Aucune affectation enregistrée.</div>}
            </div>
          </section>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
