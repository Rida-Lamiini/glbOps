import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Plus,
  ChevronRight,
  AlertTriangle,
  Pencil,
  Check,
  ExternalLink,
  Users,
  Wrench,
  Truck,
  Clock,
  Paperclip,
  FolderOpen,
  StickyNote,
  Info,
  Layers,
} from "lucide-react";
import { STAGES, STAGE_COLORS, NATURES } from "../constants";
import { visibleToUser } from "../utils/access";
import { parseDateFR, today } from "../utils/dates";
import { notifySuccess } from "../utils/notify";
import { fadeUpVariants } from "../lib/motionVariants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { reverseGeocode } from "../utils/geocode";
import { formatLambert } from "../utils/lambert";
import { AttachmentItem } from "./AttachmentsPanel";
import LocationPicker from "./LocationPicker";
import HistoriqueTimeline from "./HistoriqueTimeline";
import ProjetMap from "./ProjetMap";

export default function ProjetFiche({
  projet,
  client,
  materiels,
  vehicules,
  onClose,
  onOpenPrestation,
  onAddPrestation,
  onOpenClient,
  onEditProjet,
  onUpdateNotes,
  onAddAttachments,
  onRemoveAttachment,
  currentUser,
  isOffice,
}) {
  const [tab, setTab] = useState("infos");
  const [showNew, setShowNew] = useState(false);
  const [nature, setNature] = useState(NATURES[0]);
  const [editing, setEditing] = useState(false);
  const [refDraft, setRefDraft] = useState(projet.referenceFonciere);
  const [situationDraft, setSituationDraft] = useState(projet.situation);
  const [natureProjetDraft, setNatureProjetDraft] = useState(projet.naturePrestationProjet);
  const [latDraft, setLatDraft] = useState(projet.lat ?? "");
  const [lngDraft, setLngDraft] = useState(projet.lng ?? "");
  const [notesDraft, setNotesDraft] = useState(projet.notes || "");
  const [geocoding, setGeocoding] = useState(false);
  const geocodeAbort = useRef(null);
  const [attachLabel, setAttachLabel] = useState("");
  const [attachChemin, setAttachChemin] = useState("");

  const visiblePrestations = projet.prestations.filter((p) => visibleToUser(p, currentUser));
  const attachments = projet.attachments || [];
  const hasLocation = projet.lat != null && projet.lng != null;

  const handleAddFiles = (fileList) => {
    const label = attachLabel.trim();
    const author = currentUser.name || currentUser.role;
    const newFiles = Array.from(fileList).map((f) => ({ label: label || undefined, name: f.name, size: f.size, author, date: today() }));
    if (newFiles.length === 0) return;
    onAddAttachments(projet.id, newFiles);
    setAttachLabel("");
    notifySuccess("Pièce jointe ajoutée");
  };

  const addCheminAttachment = () => {
    const chemin = attachChemin.trim();
    if (!chemin) return;
    const label = attachLabel.trim();
    const author = currentUser.name || currentUser.role;
    onAddAttachments(projet.id, [{ label: label || undefined, chemin, author, date: today() }]);
    setAttachLabel("");
    setAttachChemin("");
    notifySuccess("Pièce jointe ajoutée");
  };

  const handlePick = (pickedLat, pickedLng) => {
    setLatDraft(pickedLat.toFixed(5));
    setLngDraft(pickedLng.toFixed(5));
    if (situationDraft.trim()) return;
    geocodeAbort.current?.abort();
    const controller = new AbortController();
    geocodeAbort.current = controller;
    setGeocoding(true);
    reverseGeocode(pickedLat, pickedLng, controller.signal)
      .then((label) => { if (label) setSituationDraft(label); })
      .catch(() => {})
      .finally(() => setGeocoding(false));
  };

  const startEdit = () => {
    setRefDraft(projet.referenceFonciere);
    setSituationDraft(projet.situation);
    setNatureProjetDraft(projet.naturePrestationProjet);
    setLatDraft(projet.lat ?? "");
    setLngDraft(projet.lng ?? "");
    setTab("infos");
    setEditing(true);
  };

  const submitEdit = () => {
    const latNum = parseFloat(String(latDraft).replace(",", "."));
    const lngNum = parseFloat(String(lngDraft).replace(",", "."));
    onEditProjet(projet.id, {
      referenceFonciere: refDraft.trim() || projet.referenceFonciere,
      situation: situationDraft.trim() || projet.situation,
      naturePrestationProjet: natureProjetDraft.trim(),
      lat: Number.isFinite(latNum) ? latNum : null,
      lng: Number.isFinite(lngNum) ? lngNum : null,
    });
    notifySuccess("Projet modifié");
    setEditing(false);
  };

  const saveNotes = () => {
    onUpdateNotes(projet.id, notesDraft);
    notifySuccess("Note enregistrée");
  };

  // HistoriqueTimeline expects oldest-first input (it reverses for display itself). `tag`
  // carries the prestation id as a small chip instead of a separate table column — the label
  // itself stays untouched so the component's event-type classification still matches.
  const timelineHistory = projet.prestations
    .flatMap((p) => p.history.map((h) => ({ ...h, tag: p.id })))
    .sort((a, b) => (parseDateFR(a.date) ?? 0) - (parseDateFR(b.date) ?? 0));

  const agentsChantier = [...new Set(projet.prestations.flatMap((p) => p.agentChantier || []))];
  const materielNames = [...new Set(projet.prestations.flatMap((p) => p.materielIds || []))]
    .map((id) => materiels?.find((m) => m.id === id)?.nom)
    .filter(Boolean);
  const vehiculeNames = [...new Set(projet.prestations.map((p) => p.vehiculeId).filter(Boolean))]
    .map((id) => vehicules?.find((v) => v.id === id)?.nom)
    .filter(Boolean);
  const agentsBureau = [...new Set(projet.prestations.map((p) => p.agentBureau).filter(Boolean))];
  const agentsControle = [...new Set(projet.prestations.map((p) => p.agentControle).filter(Boolean))];
  const hasTeam = agentsChantier.length + materielNames.length + vehiculeNames.length + agentsBureau.length + agentsControle.length > 0;

  const TABS = [
    { key: "infos", label: "Informations", icon: Info },
    { key: "prestations", label: "Prestations", icon: Layers, count: visiblePrestations.length },
    { key: "historique", label: "Historique", icon: Clock },
    { key: "documents", label: "Documents", icon: Paperclip, count: attachments.length },
  ];

  return (
    <motion.div className="gt-fiche" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
      <div className="gt-fiche-head">
        <Button variant="outline" size="sm" onClick={onClose}>
          <ArrowLeft size={14} /> Retour à la liste
        </Button>

        <div className="gt-fiche-head-main">
          <div className="gt-mono gt-fiche-id">{projet.id}</div>
          {onOpenClient && client ? (
            <button className="gt-fiche-title gt-fiche-title-link" onClick={() => onOpenClient(client.id)}>
              {client.nom}
            </button>
          ) : (
            <div className="gt-fiche-title">{client?.nom || "—"}</div>
          )}
        </div>

        <div className="gt-fiche-head-actions">
          {hasLocation && (
            <Button variant="outline" size="sm" asChild>
              <a href={`https://www.google.com/maps?q=${projet.lat},${projet.lng}`} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Voir sur Google Maps
              </a>
            </Button>
          )}
          {isOffice && !editing && (
            <Button size="sm" className="bg-[var(--accent)] text-white hover:opacity-90" onClick={startEdit}>
              <Pencil size={13} /> Modifier
            </Button>
          )}
        </div>
      </div>

      <div className="gt-fiche-chips">
        <span className="gt-chip">Code {client?.id || "—"}</span>
        <span className="gt-chip">Réf. foncière {projet.referenceFonciere}</span>
        <span className="gt-chip"><MapPin size={12} /> {projet.situation}</span>
        <span className="gt-chip">{projet.naturePrestationProjet}</span>
      </div>

      <div className="gt-fiche-body">
        {/* ---------------- Côté carte ---------------- */}
        <div className="gt-fiche-mapside">
          {editing ? (
            <div className="gt-section gt-fiche-mapcard">
              <h4><MapPin size={13} strokeWidth={2.2} /> Localiser le projet</h4>
              <LocationPicker
                lat={latDraft !== "" ? parseFloat(String(latDraft).replace(",", ".")) : null}
                lng={lngDraft !== "" ? parseFloat(String(lngDraft).replace(",", ".")) : null}
                onPick={handlePick}
                geocoding={geocoding}
                boundary={projet.boundary || null}
                onBoundaryChange={(boundary) => onEditProjet(projet.id, { boundary })}
              />
            </div>
          ) : (
            <>
              <ProjetMap lat={projet.lat} lng={projet.lng} boundary={projet.boundary || null} />
              <div className="gt-section">
                <h4><MapPin size={13} strokeWidth={2.2} /> Localisation</h4>
                {hasLocation ? (
                  <div className="gt-fiche-coords">
                    <div className="gt-fiche-coordrow">
                      <span className="gt-fiche-coordlabel">Latitude / Longitude</span>
                      <span className="gt-mono">{projet.lat.toFixed(5)}, {projet.lng.toFixed(5)}</span>
                    </div>
                    <div className="gt-fiche-coordrow">
                      <span className="gt-fiche-coordlabel">Lambert Nord Maroc (EPSG:26191)</span>
                      <span className="gt-mono">{formatLambert(projet.lat, projet.lng)}</span>
                    </div>
                    <div className="gt-fiche-coordrow">
                      <span className="gt-fiche-coordlabel">Situation</span>
                      <span>{projet.situation}</span>
                    </div>
                    <div className="gt-fiche-coordrow">
                      <span className="gt-fiche-coordlabel">Parcelle</span>
                      <span>{projet.boundary ? "Contour tracé" : "Aucun contour tracé"}</span>
                    </div>
                  </div>
                ) : (
                  <div className="gt-list-empty">Coordonnées GPS non renseignées.</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ---------------- Côté informations ---------------- */}
        <div className="gt-fiche-infoside">
          {!editing && (
            <div className="gt-fiche-tabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={tab === t.key ? "is-active" : undefined}
                  onClick={() => setTab(t.key)}
                >
                  <t.icon size={13} />
                  {t.label}
                  {t.count != null && <span className="gt-fiche-tabcount">{t.count}</span>}
                </button>
              ))}
            </div>
          )}

          {editing && (
            <div className="gt-section">
              <h4><Pencil size={13} strokeWidth={2.2} /> Modifier le projet</h4>
              <div className="gt-form">
                <Label>Référence foncière</Label>
                <Input value={refDraft} onChange={(e) => setRefDraft(e.target.value)} />
                <Label>Situation / localisation</Label>
                <Input value={situationDraft} onChange={(e) => setSituationDraft(e.target.value)} />
                <Label>Nature du projet</Label>
                <Input value={natureProjetDraft} onChange={(e) => setNatureProjetDraft(e.target.value)} />
                <div className="gt-formrow">
                  <div style={{ flex: 1 }}>
                    <Label>Latitude</Label>
                    <Input value={latDraft} onChange={(e) => setLatDraft(e.target.value)} placeholder="ex. 33.9716" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>Longitude</Label>
                    <Input value={lngDraft} onChange={(e) => setLngDraft(e.target.value)} placeholder="ex. -6.8498" />
                  </div>
                </div>
                <div className="gt-btnrow">
                  <Button onClick={submitEdit} className="bg-[var(--accent)] text-white hover:opacity-90">
                    <Check size={14} /> Enregistrer
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!editing && tab === "infos" && (
            <>
              <div className="gt-section">
                <h4><Info size={13} strokeWidth={2.2} /> Identification</h4>
                <div className="gt-fiche-coords">
                  <div className="gt-fiche-coordrow">
                    <span className="gt-fiche-coordlabel">Code projet</span>
                    <span className="gt-mono">{projet.id}</span>
                  </div>
                  <div className="gt-fiche-coordrow">
                    <span className="gt-fiche-coordlabel">Client</span>
                    <span>{client?.nom || "—"}</span>
                  </div>
                  <div className="gt-fiche-coordrow">
                    <span className="gt-fiche-coordlabel">Code client</span>
                    <span className="gt-mono">{client?.id || "—"}</span>
                  </div>
                  <div className="gt-fiche-coordrow">
                    <span className="gt-fiche-coordlabel">Référence foncière</span>
                    <span className="gt-mono">{projet.referenceFonciere || "—"}</span>
                  </div>
                  <div className="gt-fiche-coordrow">
                    <span className="gt-fiche-coordlabel">Nature du projet</span>
                    <span>{projet.naturePrestationProjet || "—"}</span>
                  </div>
                  <div className="gt-fiche-coordrow">
                    <span className="gt-fiche-coordlabel">Prestations</span>
                    <span>{visiblePrestations.length}</span>
                  </div>
                </div>
              </div>

              <div className="gt-section">
                <h4><Users size={13} strokeWidth={2.2} /> Équipe & ressources mobilisées</h4>
                {hasTeam ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {agentsChantier.map((a) => (
                      <Badge key={`ac-${a}`} variant="secondary"><Users size={11} /> {a}</Badge>
                    ))}
                    {agentsBureau.map((a) => (
                      <Badge key={`ab-${a}`} variant="secondary">{a} · bureau</Badge>
                    ))}
                    {agentsControle.map((a) => (
                      <Badge key={`ao-${a}`} variant="secondary">{a} · contrôle</Badge>
                    ))}
                    {materielNames.map((m) => (
                      <Badge key={`m-${m}`} variant="outline"><Wrench size={11} /> {m}</Badge>
                    ))}
                    {vehiculeNames.map((v) => (
                      <Badge key={`v-${v}`} variant="outline"><Truck size={11} /> {v}</Badge>
                    ))}
                  </div>
                ) : (
                  <div className="gt-list-empty">Aucune ressource affectée pour l'instant.</div>
                )}
              </div>

              <div className="gt-section">
                <h4><StickyNote size={13} strokeWidth={2.2} /> Notes internes</h4>
                {isOffice ? (
                  <>
                    <Textarea
                      rows={3}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Notes internes sur ce projet (contexte, contraintes, contact client...)"
                    />
                    <Button
                      size="sm"
                      className="mt-2 bg-[var(--accent)] text-white hover:opacity-90"
                      onClick={saveNotes}
                      disabled={notesDraft === (projet.notes || "")}
                    >
                      Enregistrer la note
                    </Button>
                  </>
                ) : projet.notes ? (
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{projet.notes}</div>
                ) : (
                  <div className="gt-list-empty">Aucune note.</div>
                )}
              </div>
            </>
          )}

          {!editing && tab === "prestations" && (
            <div className="gt-section">
              <h4><Layers size={13} strokeWidth={2.2} /> Prestations ({visiblePrestations.length})</h4>
              <div className="gt-projet-prestations">
                {visiblePrestations.map((p) => (
                  <button className="gt-listrow" key={p.id} onClick={() => onOpenPrestation(p.id)}>
                    <div className="gt-listrow-info">
                      <div className="gt-mono gt-listrow-id">{p.id}</div>
                      <div className="gt-listrow-client">{p.natureDemandee || "Non définie"}</div>
                    </div>
                    <div className="gt-listrow-progress">
                      {STAGES.map((s, i) => {
                        const idx = STAGES.findIndex((x) => x.key === p.stage);
                        return (
                          <div
                            key={s.key}
                            className="gt-listrow-seg"
                            style={i <= idx ? { background: STAGE_COLORS[p.stage] } : undefined}
                          />
                        );
                      })}
                    </div>
                    <div className="gt-listrow-stage">{STAGES.find((s) => s.key === p.stage).label}</div>
                    {p.cycles > 0 && (
                      <span className="gt-pill gt-pill-bad">
                        <AlertTriangle size={11} /> ×{p.cycles}
                      </span>
                    )}
                  </button>
                ))}
                {visiblePrestations.length === 0 && <div className="gt-list-empty">Aucune prestation visible.</div>}
              </div>

              {isOffice && (
                !showNew ? (
                  <button className="gt-btn gt-btn-neutral" style={{ marginTop: 12 }} onClick={() => setShowNew(true)}>
                    <Plus size={14} /> Ajouter une prestation à ce projet
                  </button>
                ) : (
                  <div className="gt-reprogbox" style={{ marginTop: 12 }}>
                    <label>Nature de la prestation</label>
                    <select value={nature} onChange={(e) => setNature(e.target.value)}>
                      {NATURES.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                    <button
                      className="gt-btn gt-btn-primary"
                      onClick={() => {
                        onAddPrestation(projet.id, nature);
                        setShowNew(false);
                        notifySuccess("Prestation créée");
                      }}
                    >
                      Créer la prestation <ChevronRight size={14} />
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {!editing && tab === "historique" && (
            <div className="gt-section">
              <h4><Clock size={13} strokeWidth={2.2} /> Historique du projet</h4>
              <HistoriqueTimeline history={timelineHistory} emptyLabel="Aucun événement pour l'instant." />
            </div>
          )}

          {!editing && tab === "documents" && (
            <div className="gt-section">
              <h4><Paperclip size={13} strokeWidth={2.2} /> Pièces jointes du projet ({attachments.length})</h4>
              {isOffice && (
                <div className="gt-form">
                  <input
                    value={attachLabel}
                    onChange={(e) => setAttachLabel(e.target.value)}
                    placeholder="Description (optionnel), ex. Plan de masse"
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
                      placeholder="Ou un chemin réseau, ex. \\SERVEUR\Projets\..."
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
                    onRemove={() => { onRemoveAttachment(projet.id, i); notifySuccess("Pièce jointe supprimée"); }}
                  />
                ))}
                {attachments.length === 0 && <div className="gt-list-empty">Aucune pièce jointe au niveau du projet.</div>}
              </div>
              <div className="gt-attach-note">Les fichiers sont téléversés sur le serveur ; un chemin réseau est simplement mémorisé.</div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
