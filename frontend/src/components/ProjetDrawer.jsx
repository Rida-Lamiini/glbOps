import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
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
  FileScan,
  LayoutDashboard,
  ListChecks,
} from "lucide-react";
import { STAGES, STAGE_COLORS, NATURES } from "../constants";
import { visibleToUser } from "../utils/access";
import { parseDateFR, today } from "../utils/dates";
import { notifySuccess, notifyError } from "../utils/notify";
import { backdropVariants, drawerVariants } from "../lib/motionVariants";
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
import { listCadastreLots, reuseLot } from "./cadastre/api";
import LotSuggestions from "./cadastre/LotSuggestions";
import { projetStatus } from "../utils/stats";
import { STATUS_LABELS, STATUS_PILL_KIND } from "../constants";
import "./projet-drawer.css";

export default function ProjetDrawer({
  projet,
  client,
  materiels,
  vehicules,
  onClose,
  onOpenPrestation,
  onAddPrestation,
  onOpenClient,
  onGoCadastre,
  onEditProjet,
  onUpdateNotes,
  onAddAttachments,
  onRemoveAttachment,
  currentUser,
  isOffice,
}) {
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
  const [tab, setTab] = useState("resume");
  const [lots, setLots] = useState(null);
  const [lotsVersion, setLotsVersion] = useState(0);
  const [reusingId, setReusingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listCadastreLots()
      .then((all) => !cancelled && setLots(all.filter((l) => l.projet === projet.id)))
      .catch(() => !cancelled && setLots([]));
    return () => { cancelled = true; };
  }, [projet.id, lotsVersion]);

  const handleReuseLot = async (match) => {
    setReusingId(match.id);
    try {
      await reuseLot(match.id, projet.id);
      setLotsVersion((v) => v + 1);
    } catch {
      notifyError("Ce lot n'a pas pu être réutilisé.");
    } finally {
      setReusingId(null);
    }
  };

  const visiblePrestations = projet.prestations.filter((p) => visibleToUser(p, currentUser));

  const handleAddFiles = (fileList) => {
    const label = attachLabel.trim();
    const author = currentUser.name || currentUser.role;
    const newFiles = Array.from(fileList).map((f) => ({ label: label || undefined, name: f.name, size: f.size, file: f, type: "autre", author, date: today() }));
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

  const status = projetStatus(projet);
  const livrees = projet.prestations.filter((p) => p.stage === "livraison" && p.chemin).length;
  const nonConformes = projet.prestations.filter((p) => p.cycles > 0).length;
  const enCours = Math.max(0, projet.prestations.length - livrees - nonConformes);

  const hasLocation = projet.lat != null && projet.lng != null;
  const attachments = projet.attachments || [];

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-drawer" onClick={(e) => e.stopPropagation()} variants={drawerVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head pd-head">
          <div className="pd-head-main">
            <div className="pd-head-top">
              <span className="gt-mono gt-drawer-id">{projet.id}</span>
              <span className={`gt-status-pill ${STATUS_PILL_KIND[status]}`}>
                <span className="gt-status-pill-dot" />{STATUS_LABELS[status]}
              </span>
            </div>
            {onOpenClient && client ? (
              <button className="pd-client pd-client-link" onClick={() => onOpenClient(client.id)}>
                {client.nom}
              </button>
            ) : (
              <div className="pd-client">{client?.nom || "—"}</div>
            )}
          </div>
          <button className="gt-iconbtn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="pd-kpis">
          <div className="pd-kpi"><strong>{projet.prestations.length}</strong><span>Prestations</span></div>
          <div className="pd-kpi"><strong style={{ color: "var(--status-info)" }}>{enCours}</strong><span>En cours</span></div>
          <div className="pd-kpi"><strong style={{ color: nonConformes ? "var(--status-danger)" : undefined }}>{nonConformes}</strong><span>Non conformes</span></div>
          <div className="pd-kpi"><strong style={{ color: "var(--status-success)" }}>{livrees}</strong><span>Livrées</span></div>
        </div>

        {!editing ? (
          <div className="gt-drawer-meta">
            <span className="gt-chip">Code {client?.id || "—"}</span>
            <span className="gt-chip">Réf. foncière {projet.referenceFonciere}</span>
            <span className="gt-chip"><MapPin size={12} /> {projet.situation}</span>
            <span className="gt-chip">{projet.naturePrestationProjet}</span>
            {isOffice && (
              <button className="gt-iconbtn gt-rename-btn" onClick={startEdit}>
                <Pencil size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="gt-form" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
            <Label>Référence foncière</Label>
            <Input value={refDraft} onChange={(e) => setRefDraft(e.target.value)} />
            <Label>Situation / localisation</Label>
            <Input value={situationDraft} onChange={(e) => setSituationDraft(e.target.value)} />
            <Label>Nature du projet</Label>
            <Input value={natureProjetDraft} onChange={(e) => setNatureProjetDraft(e.target.value)} />
            <Label>Coordonnées GPS</Label>
            <LocationPicker
              lat={latDraft !== "" ? parseFloat(String(latDraft).replace(",", ".")) : null}
              lng={lngDraft !== "" ? parseFloat(String(lngDraft).replace(",", ".")) : null}
              onPick={handlePick}
              geocoding={geocoding}
              boundary={projet.boundary || null}
              onBoundaryChange={(boundary) => onEditProjet(projet.id, { boundary })}
            />
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
        )}

        <div className="pd-tabs" role="tablist" aria-label="Sections du projet">
          {[
            { key: "resume", label: "Résumé", icon: LayoutDashboard },
            { key: "prestations", label: "Prestations", icon: ListChecks, count: visiblePrestations.length },
            { key: "cadastre", label: "Cadastre", icon: FileScan, count: lots ? lots.length : undefined },
            { key: "documents", label: "Documents", icon: Paperclip, count: attachments.length },
            { key: "historique", label: "Historique", icon: Clock },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`pd-tab ${tab === t.key ? "is-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <t.icon size={14} />
              <span>{t.label}</span>
              {t.count > 0 && <span className="pd-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="gt-drawer-body" role="tabpanel">
          {tab === "resume" && (
          <section className="gt-section">
            <h4><MapPin size={13} strokeWidth={2.2} /> Localisation</h4>
            {hasLocation ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="gt-mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                    {projet.lat.toFixed(4)}, {projet.lng.toFixed(4)}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://www.google.com/maps?q=${projet.lat},${projet.lng}`} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> Voir sur Google Maps
                    </a>
                  </Button>
                </div>
                <div className="gt-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                  Lambert Nord Maroc (EPSG:26191) — {formatLambert(projet.lat, projet.lng)}
                </div>
              </div>
            ) : (
              <div className="gt-list-empty">Coordonnées GPS non renseignées.</div>
            )}
          </section>
          )}

          {tab === "resume" && (
          <section className="gt-section">
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
          </section>
          )}

          {tab === "prestations" && (
          <section className="gt-section">
            <h4>Prestations ({visiblePrestations.length})</h4>
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
          </section>
          )}

          {tab === "cadastre" && (
            <section className="gt-section">
              <h4><FileScan size={13} strokeWidth={2.2} /> Lots cadastraux liés</h4>
              {lots === null ? (
                <div className="gt-attach-note">Chargement…</div>
              ) : lots.length === 0 ? (
                <div className="pd-empty">
                  <strong>Aucun lot lié à ce projet</strong>
                  <p>Importez le plan de bornage dans Cadastre et renseignez « Projet lié » : {projet.id}. Le lot apparaîtra ici et sur la carte.</p>
                </div>
              ) : (
                <div className="pd-lots">
                  {lots.map((l) => (
                    <div className="pd-lot" key={l.id}>
                      <div>
                        <div className="pd-lot-name">{l.proprieteDite}</div>
                        <div className="gt-mono pd-lot-ref">Titre {l.titreFoncier}{l.prestation ? ` · ${l.prestation}` : ""}{l.createdByName ? ` · ${l.createdByName}` : ""}</div>
                      </div>
                      <div className="pd-lot-right">
                        <strong>{l.surfaceCalculeeM2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²</strong>
                        <span className={`gt-status-pill ${l.statut === "valide" ? "success" : l.statut === "verifie" ? "info" : "neutral"}`}>
                          <span className="gt-status-pill-dot" />{l.statut === "valide" ? "Validé" : l.statut === "verifie" ? "Vérifié" : "Brouillon"}
                        </span>
                        <span className={`gt-status-pill ${l.conforme ? "success" : "danger"}`}>
                          <span className="gt-status-pill-dot" />{l.conforme ? "Conforme" : "Écart"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <h4 style={{ marginTop: 18 }}><MapPin size={13} strokeWidth={2.2} /> Lots voisins ou historiques</h4>
              <LotSuggestions
                key={lotsVersion}
                titre={projet.referenceFonciere}
                lat={projet.lat}
                lng={projet.lng}
                projetId={projet.id}
                mode="action"
                onReuse={handleReuseLot}
                busyId={reusingId}
              />
              <div className="gt-attach-note" style={{ marginTop: 6 }}>Même titre foncier ou moins de 200 m du repère du projet.</div>
              {onGoCadastre && (
                <button className="gt-btn gt-btn-neutral" style={{ marginTop: 12 }} onClick={onGoCadastre}>
                  <FileScan size={14} /> Ouvrir le module Cadastre
                </button>
              )}
            </section>
          )}

          {tab === "historique" && (
          <section className="gt-section">
            <h4><Clock size={13} strokeWidth={2.2} /> Historique du projet</h4>
            <HistoriqueTimeline history={timelineHistory} emptyLabel="Aucun événement pour l'instant." />
          </section>
          )}

          {tab === "resume" && (
          <section className="gt-section">
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
          </section>
          )}

          {tab === "documents" && (
          <section className="gt-section">
            <h4>
              <Paperclip size={13} strokeWidth={2.2} /> Pièces jointes du projet ({attachments.length})
            </h4>
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
          </section>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
