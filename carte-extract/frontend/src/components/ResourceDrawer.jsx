import React, { useEffect, useState } from "react";
import { AttachmentItem } from "./AttachmentsPanel";
import DrawerTabs from "./DrawerTabs";
import { motion } from "framer-motion";
import { X, Check, Pencil, AlertTriangle, Wrench, Paperclip, FolderOpen, Plus, MapPin, Coins, Clock, ListChecks, ShieldCheck, ArrowLeftRight, QrCode, Printer } from "lucide-react";
import { STAGES, STAGE_COLORS, RESOURCE_STATUSES, RESOURCE_TYPES } from "../constants";
import { computeResourceStats } from "../utils/stats";
import { today, isPastDue } from "../utils/dates";
import { notifySuccess } from "../utils/notify";
import { backdropVariants, drawerVariants } from "../lib/motionVariants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import ResourceTypeIcon from "./ResourceTypeIcon";
import VehiculePapiers from "./VehiculePapiers";
import ResourceMovements from "./ResourceMovements";
import { generateLabelSheet, qrPreview } from "../utils/labels";
import { resourceUrl } from "../utils/resourceLink";
import { vehiculeAlerts } from "../utils/vehicule";

export default function ResourceDrawer({
  item,
  projects,
  employees = [],
  matches,
  typeLabel,
  onClose,
  onOpenPrestation,
  onRenameItem,
  onEditItem,
  onAddMaintenance,
  onAddAttachments,
  onRemoveAttachment,
  onServerPatch,
  currentUser,
  isOffice,
}) {
  const [tab, setTab] = useState("fiche");
  const [renaming, setRenaming] = useState(false);
  const [nomDraft, setNomDraft] = useState(item.nom);
  const [editing, setEditing] = useState(false);
  const [typeDraft, setTypeDraft] = useState(item.type || "autre");
  const [marqueDraft, setMarqueDraft] = useState(item.marque || "");
  const [modeleDraft, setModeleDraft] = useState(item.modele || "");
  const [serieDraft, setSerieDraft] = useState(item.numeroSerie || "");
  const [statusDraft, setStatusDraft] = useState(item.status || "operationnel");
  const [derniereDraft, setDerniereDraft] = useState(item.derniereCalibration || "");
  const [prochaineDraft, setProchaineDraft] = useState(item.prochaineCalibration || "");
  const [emplacementDraft, setEmplacementDraft] = useState(item.emplacement || "");
  const [dateAchatDraft, setDateAchatDraft] = useState(item.dateAchat || "");
  const [valeurDraft, setValeurDraft] = useState(item.valeur || "");
  const [fournisseurDraft, setFournisseurDraft] = useState(item.fournisseur || "");
  const [maintenanceDate, setMaintenanceDate] = useState(today());
  const [maintenanceLabel, setMaintenanceLabel] = useState("");
  const [attachLabel, setAttachLabel] = useState("");
  const [attachChemin, setAttachChemin] = useState("");
  const [qr, setQr] = useState("");
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    qrPreview(item.id).then((u) => !cancelled && setQr(u)).catch(() => {});
    return () => { cancelled = true; };
  }, [item.id]);
  const printLabel = async () => {
    setPrinting(true);
    try {
      await generateLabelSheet([item], `etiquette-${item.id}.pdf`);
    } finally {
      setPrinting(false);
    }
  };
  const stats = computeResourceStats(item, projects, matches);
  const isMateriel = typeLabel === "Matériel";
  const isVehicule = typeLabel === "Véhicule";
  const alerts = isVehicule ? vehiculeAlerts(item) : [];

  const submitRename = () => {
    if (nomDraft.trim()) {
      onRenameItem(item.id, nomDraft.trim());
      notifySuccess(`${typeLabel} renommé`);
    }
    setRenaming(false);
  };

  const startEdit = () => {
    setTypeDraft(item.type || "autre");
    setMarqueDraft(item.marque || "");
    setModeleDraft(item.modele || "");
    setSerieDraft(item.numeroSerie || "");
    setStatusDraft(item.status || "operationnel");
    setDerniereDraft(item.derniereCalibration || "");
    setProchaineDraft(item.prochaineCalibration || "");
    setEmplacementDraft(item.emplacement || "");
    setDateAchatDraft(item.dateAchat || "");
    setValeurDraft(item.valeur || "");
    setFournisseurDraft(item.fournisseur || "");
    setEditing(true);
  };

  const submitEdit = () => {
    onEditItem(item.id, {
      type: typeDraft,
      marque: marqueDraft.trim(),
      modele: modeleDraft.trim(),
      numeroSerie: serieDraft.trim(),
      status: statusDraft,
      derniereCalibration: derniereDraft,
      prochaineCalibration: prochaineDraft,
      emplacement: emplacementDraft.trim(),
      dateAchat: dateAchatDraft,
      valeur: valeurDraft.trim(),
      fournisseur: fournisseurDraft.trim(),
    });
    notifySuccess("Fiche mise à jour");
    setEditing(false);
  };

  const submitMaintenance = () => {
    if (!maintenanceLabel.trim()) return;
    onAddMaintenance(item.id, { date: maintenanceDate, label: maintenanceLabel.trim() });
    setMaintenanceLabel("");
    notifySuccess("Intervention ajoutée");
  };

  const handleAddFiles = (fileList) => {
    const label = attachLabel.trim();
    const author = currentUser.name || currentUser.role;
    const newFiles = Array.from(fileList).map((f) => ({ label: label || undefined, name: f.name, size: f.size, author, date: today() }));
    if (newFiles.length === 0) return;
    onAddAttachments(item.id, newFiles);
    setAttachLabel("");
    notifySuccess("Pièce jointe ajoutée");
  };

  const addCheminAttachment = () => {
    const chemin = attachChemin.trim();
    if (!chemin) return;
    const label = attachLabel.trim();
    const author = currentUser.name || currentUser.role;
    onAddAttachments(item.id, [{ label: label || undefined, chemin, author, date: today() }]);
    setAttachLabel("");
    setAttachChemin("");
    notifySuccess("Pièce jointe ajoutée");
  };

  const statusInfo = RESOURCE_STATUSES.find((s) => s.key === (item.status || "operationnel"));
  const typeInfo = RESOURCE_TYPES.find((t) => t.key === (item.type || "autre"));
  const overdue = isMateriel && isPastDue(item.prochaineCalibration);
  const attachments = item.attachments || [];
  const maintenanceLog = item.maintenanceLog || [];

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-drawer" onClick={(e) => e.stopPropagation()} variants={drawerVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div className="gt-resource-icon" style={{ borderColor: statusInfo?.color }}>
              <ResourceTypeIcon type={item.type} size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="gt-mono gt-drawer-id">{item.id} · {typeInfo?.label || typeLabel}</div>
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
          <span className="gt-chip">{stats.nbUsageTotal} utilisation{stats.nbUsageTotal > 1 ? "s" : ""}</span>
          <span className="gt-chip" style={stats.enCours > 0 ? { borderColor: "var(--amber)", color: "var(--amber)" } : undefined}>
            {stats.enCours} en cours
          </span>
          {statusInfo && (
            <Badge style={{ borderColor: statusInfo.color, color: statusInfo.color }} variant="outline">
              {statusInfo.label}
            </Badge>
          )}
          {overdue && (
            <Badge variant="outline" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
              <AlertTriangle size={11} /> Étalonnage en retard
            </Badge>
          )}
          {alerts.map((a) => (
            <Badge key={a.key} variant="outline" style={a.level === "late" ? { borderColor: "var(--bad)", color: "var(--bad)" } : { borderColor: "var(--amber)", color: "var(--amber)" }}>
              <AlertTriangle size={11} /> {a.label} {a.level === "late" ? "expirée" : "à renouveler"}
            </Badge>
          ))}
        </div>

        <DrawerTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "fiche", label: "Fiche", icon: Wrench },
            ...(isVehicule ? [{ key: "papiers", label: "Papiers", icon: ShieldCheck, count: alerts.length || undefined }] : []),
            { key: "affectations", label: "Affectations", icon: ListChecks, count: stats.assignments.length },
            { key: "sorties", label: "Sorties & QR", icon: ArrowLeftRight },
            { key: "maintenance", label: "Maintenance", icon: Clock, count: maintenanceLog.length },
            { key: "documents", label: "Documents", icon: Paperclip, count: attachments.length },
          ]}
        />

        <div className="gt-drawer-body" role="tabpanel">
          {tab === "fiche" && (
          <section className="gt-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h4 style={{ margin: 0 }}><Wrench size={13} strokeWidth={2.2} /> Identité & suivi</h4>
              {isOffice && !editing && (
                <button className="gt-iconbtn" onClick={startEdit}>
                  <Pencil size={13} />
                </button>
              )}
            </div>
            {!editing ? (
              <div className="gt-resource-grid" style={{ marginTop: 8 }}>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">Type</span>
                  <span>{typeInfo?.label || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">Marque</span>
                  <span>{item.marque || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">Modèle</span>
                  <span>{item.modele || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">N° de série{!isMateriel ? " / immat." : ""}</span>
                  <span className="gt-mono">{item.numeroSerie || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label"><MapPin size={10} /> Emplacement</span>
                  <span>{item.emplacement || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label"><Coins size={10} /> Valeur</span>
                  <span>{item.valeur || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">Date d'achat</span>
                  <span>{item.dateAchat || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label">Fournisseur</span>
                  <span>{item.fournisseur || "—"}</span>
                </div>
              </div>
            ) : (
              <div className="gt-form" style={{ marginTop: 8 }}>
                <Label>Type</Label>
                <select value={typeDraft} onChange={(e) => setTypeDraft(e.target.value)}>
                  {RESOURCE_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <div className="gt-formrow">
                  <div style={{ flex: 1 }}>
                    <Label>Marque</Label>
                    <Input value={marqueDraft} onChange={(e) => setMarqueDraft(e.target.value)} placeholder="ex. Leica" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>Modèle</Label>
                    <Input value={modeleDraft} onChange={(e) => setModeleDraft(e.target.value)} placeholder="ex. TS16" />
                  </div>
                </div>
                <Label>N° de série{!isMateriel ? " / immatriculation" : ""}</Label>
                <Input value={serieDraft} onChange={(e) => setSerieDraft(e.target.value)} placeholder="ex. LC-88213" />
                <Label>Statut</Label>
                <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
                  {RESOURCE_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                {isMateriel && (
                  <div className="gt-formrow">
                    <div style={{ flex: 1 }}>
                      <Label>Dernier étalonnage</Label>
                      <DatePicker value={derniereDraft} onChange={setDerniereDraft} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Label>Prochain étalonnage dû</Label>
                      <DatePicker value={prochaineDraft} onChange={setProchaineDraft} />
                    </div>
                  </div>
                )}
                <Label>Emplacement</Label>
                <Input value={emplacementDraft} onChange={(e) => setEmplacementDraft(e.target.value)} placeholder="ex. Armoire matériel — Agence Rabat" />
                <div className="gt-formrow">
                  <div style={{ flex: 1 }}>
                    <Label>Date d'achat</Label>
                    <DatePicker value={dateAchatDraft} onChange={setDateAchatDraft} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>Valeur</Label>
                    <Input value={valeurDraft} onChange={(e) => setValeurDraft(e.target.value)} placeholder="ex. 285 000 MAD" />
                  </div>
                </div>
                <Label>Fournisseur</Label>
                <Input value={fournisseurDraft} onChange={(e) => setFournisseurDraft(e.target.value)} placeholder="ex. Leica Geosystems Maroc" />
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

          {tab === "papiers" && isVehicule && (
            <VehiculePapiers item={item} employees={employees} isOffice={isOffice} onEdit={onEditItem} />
          )}

          {tab === "sorties" && (
            <section className="gt-section">
              <h4><ArrowLeftRight size={13} strokeWidth={2.2} /> Sorties et retours</h4>
              <ResourceMovements resource={item} onChange={(patch) => onServerPatch?.(item.id, patch)} />

              <h4 style={{ marginTop: 22 }}><QrCode size={13} strokeWidth={2.2} /> Étiquette QR</h4>
              <div className="rm-qr">
                {qr ? <img src={qr} alt={`QR code de ${item.id}`} /> : <div className="rm-qr-placeholder" />}
                <div>
                  <p>Collez cette étiquette sur l'appareil. En la scannant avec un téléphone, on ouvre sa fiche pour noter la sortie ou le retour.</p>
                  <code>{resourceUrl(item.id)}</code>
                  {isOffice && (
                    <button type="button" className="gt-btn gt-btn-neutral" disabled={printing} onClick={printLabel}>
                      <Printer size={14} /> {printing ? "Génération…" : "Imprimer l'étiquette (PDF)"}
                    </button>
                  )}
                </div>
              </div>
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

          {tab === "maintenance" && (
          <section className="gt-section">
            <h4>Historique de maintenance ({maintenanceLog.length})</h4>
            <div className="gt-timeline">
              {maintenanceLog.slice().reverse().map((h, i) => (
                <div className="gt-timeline-row" key={i}>
                  <div className="gt-timeline-dot" />
                  <div>
                    <div className="gt-mono gt-timeline-date">{h.date}</div>
                    <div className="gt-timeline-label">{h.label}</div>
                  </div>
                </div>
              ))}
              {maintenanceLog.length === 0 && <div className="gt-list-empty">Aucune intervention enregistrée.</div>}
            </div>
            {isOffice && (
              <div className="gt-formrow" style={{ marginTop: 10, alignItems: "flex-end" }}>
                <div style={{ width: 140 }}>
                  <Label>Date</Label>
                  <DatePicker value={maintenanceDate} onChange={setMaintenanceDate} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Intervention</Label>
                  <Input value={maintenanceLabel} onChange={(e) => setMaintenanceLabel(e.target.value)} placeholder="ex. Révision, réparation, étalonnage..." onKeyDown={(e) => e.key === "Enter" && submitMaintenance()} />
                </div>
                <Button onClick={submitMaintenance} disabled={!maintenanceLabel.trim()}>
                  <Plus size={14} /> Ajouter
                </Button>
              </div>
            )}
          </section>
          )}

          {tab === "documents" && (
          <section className="gt-section">
            <h4>
              <Paperclip size={13} strokeWidth={2.2} /> Pièces jointes ({attachments.length})
            </h4>
            {isOffice && (
              <div className="gt-form">
                <input
                  value={attachLabel}
                  onChange={(e) => setAttachLabel(e.target.value)}
                  placeholder="Description (optionnel), ex. Certificat d'étalonnage"
                />
                <div className="gt-formrow">
                  <label className="gt-btn gt-btn-neutral gt-attach-uploadbtn" style={{ flex: 1 }}>
                    <Paperclip size={14} /> Ajouter des fichiers
                    <input type="file" multiple onChange={(e) => { handleAddFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                </div>
                <div className="gt-formrow">
                  <input
                    style={{ flex: 1 }}
                    value={attachChemin}
                    onChange={(e) => setAttachChemin(e.target.value)}
                    placeholder="Ou un chemin réseau, ex. \\SERVEUR\..."
                    className="gt-mono"
                  />
                  <button type="button" className="gt-btn gt-btn-neutral" disabled={!attachChemin.trim()} onClick={addCheminAttachment}>
                    <FolderOpen size={14} /> Ajouter le chemin
                  </button>
                </div>
              </div>
            )}
            <div className="gt-attach-grid">
              {attachments.map((a, i) => (
                <AttachmentItem
                  key={a.id ?? i}
                  a={a}
                  canRemove={isOffice}
                  onRemove={() => { onRemoveAttachment(item.id, i); notifySuccess("Pièce jointe supprimée"); }}
                />
              ))}
              {attachments.length === 0 && <div className="gt-list-empty">Aucune pièce jointe (photo, certificat d'étalonnage, manuel...).</div>}
            </div>
          </section>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
