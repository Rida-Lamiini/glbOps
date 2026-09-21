import React, { useEffect, useMemo, useState } from "react";
import {
  Upload, Loader2, ArrowLeft, Trash2, Plus, CheckCircle2, AlertTriangle, Pencil, FilePlus2,
  Search, X, FileDown, MapPin, FileSpreadsheet,
} from "lucide-react";
import {
  parseCadastrePdf, listCadastreLots, getCadastreLot, getCadastreLotGeoJSON,
  createCadastreLot, updateCadastreLot, deleteCadastreLot, readApiError, setLotStatut,
} from "./api";
import LotMap from "./LotMap";
import ExcelImportScreen from "./ExcelImport";
import { generateLotReport } from "../../utils/reportLot";
import { notifyError, notifySuccess } from "../../utils/notify";
import "./cadastre.css";

const EMPTY_INITIAL = {
  extractionMethod: "manual",
  header: { titreFoncier: "", proprieteDite: "", lot: "", geometre: "" },
  bornes: [],
  surfaceDocumentM2: "",
  correctionLambertM2: 0,
  projetId: "",
  prestationId: "",
  distanceChecks: [],
  referencePoints: [],
  lotId: null,
};

const SOURCE_LABELS = {
  ocr: "Lu par OCR — à vérifier ligne par ligne",
  "text-layer": "Texte natif du PDF",
  manual: "Saisie manuelle",
  edit: "Modification d'un lot enregistré",
};

const SURFACE_TOLERANCE_M2 = 1;
const fmt = (n, d = 2) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

// Planar shoelace on the Lambert plane — same maths as the backend, used only for a live preview.
function previewArea(bornes) {
  const pts = [...bornes].sort((a, b) => a.sequence - b.sequence).filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y));
  if (pts.length < 3) return null;
  let twice = 0;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    twice += a.x * b.y - b.x * a.y;
  });
  return Math.abs(twice) / 2;
}

const nextSequence = (bornes) => (bornes.length === 0 ? 0 : Math.max(...bornes.map((b) => b.sequence)) + 1);

function Hero({ eyebrow = "Outils", title, children }) {
  return (
    <header className="cad-hero">
      <div className="cad-eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

function Stepper({ step }) {
  const steps = ["Document", "Vérification", "Lot enregistré"];
  return (
    <ol className="cad-steps" aria-label="Progression">
      {steps.map((label, i) => (
        <li key={label} className={`cad-step ${i === step ? "is-active" : i < step ? "is-done" : ""}`} aria-current={i === step ? "step" : undefined}>
          <b>{i < step ? "✓" : i + 1}</b>
          {label}
        </li>
      ))}
    </ol>
  );
}

function ConformiteBadge({ conforme }) {
  return (
    <span className={`gt-status-pill ${conforme ? "success" : "danger"}`}>
      <span className="gt-status-pill-dot" />
      {conforme ? "Conforme" : "Écart de surface"}
    </span>
  );
}

const STATUT_INFO = {
  brouillon: { label: "Brouillon", pill: "neutral" },
  verifie: { label: "Vérifié", pill: "info" },
  valide: { label: "Validé", pill: "success" },
};

function StatutBadge({ statut }) {
  const s = STATUT_INFO[statut] || STATUT_INFO.brouillon;
  return (
    <span className={`gt-status-pill ${s.pill}`}>
      <span className="gt-status-pill-dot" />{s.label}
    </span>
  );
}

// --- Home: import + lots ------------------------------------------------------

function ImportZone({ onReview, onExcel }) {
  const [loading, setLoading] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState(null);

  const handle = async (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Le fichier doit être un PDF.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseCadastrePdf(file);
      onReview({
        extractionMethod: parsed.extractionMethod,
        header: {
          titreFoncier: parsed.header.titreFoncier || "",
          proprieteDite: parsed.header.proprieteDite || "",
          lot: parsed.header.lot || "",
          geometre: parsed.header.geometre || "",
        },
        bornes: parsed.bornes,
        surfaceDocumentM2: parsed.header.contenanceAdopteeM2 ?? parsed.header.surfaceCorrigeeM2 ?? "",
        correctionLambertM2: parsed.header.correctionLambertM2 ?? 0,
        projetId: "",
        prestationId: "",
        distanceChecks: [],
        referencePoints: [],
        lotId: null,
      });
    } catch (e) {
      setError(readApiError(e, "Analyse impossible. Vous pouvez saisir le lot manuellement."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className={`cad-drop ${over ? "is-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
    >
      <div>
        <h2>{loading ? "Lecture du document…" : "Déposez un Calcul de Contenances"}</h2>
        <p>
          {loading
            ? "Si le PDF est un scan, chaque page passe par le service OCR — comptez jusqu'à deux minutes."
            : "PDF ANCFCC : les bornes, coordonnées Lambert et surfaces sont extraites automatiquement. Vous vérifiez avant d'enregistrer."}
        </p>
        {error && <div className="cad-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </div>
      <div className="cad-drop-actions">
        <label className="cad-btn primary">
          {loading ? <Loader2 size={16} className="gt-spin-icon" /> : <Upload size={16} />}
          {loading ? "Analyse en cours" : "Choisir un PDF"}
          <input type="file" accept="application/pdf" disabled={loading} onChange={(e) => { handle(e.target.files[0]); e.target.value = ""; }} />
        </label>
        <button className="cad-btn" disabled={loading} onClick={() => onReview(EMPTY_INITIAL)}>
          <FilePlus2 size={16} /> Saisir manuellement
        </button>
        <button className="cad-btn" disabled={loading} onClick={onExcel}>
          <FileSpreadsheet size={16} /> Importer un fichier Excel
        </button>
      </div>
    </section>
  );
}

function LotsList({ reloadKey, onOpenLot }) {
  const [lots, setLots] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listCadastreLots(query)
        .then((data) => !cancelled && (setLots(data), setError(null)))
        .catch((e) => !cancelled && setError(readApiError(e, "Impossible de charger les lots.")));
    }, query ? 250 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, reloadKey]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="cad-listhead">
        <h2>Lots enregistrés{lots ? ` · ${lots.length}` : ""}</h2>
        <label className="cad-search">
          <Search size={16} color="var(--muted)" />
          <input placeholder="Titre foncier, propriété…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un lot" />
        </label>
      </div>
      {error && <div className="cad-error" role="alert">{error}</div>}
      {!lots ? (
        <div className="cad-note">Chargement…</div>
      ) : lots.length === 0 ? (
        <div className="cad-empty">
          <strong>{query ? "Aucun résultat" : "Aucun lot pour l'instant"}</strong>
          {query ? "Essayez un autre titre foncier." : "Importez un PDF ci-dessus : le lot apparaîtra ici et sur la carte."}
        </div>
      ) : (
        <div className="cad-grid">
          {lots.map((l) => (
            <button key={l.id} className="cad-card" onClick={() => onOpenLot(l.id)}>
              <div className="cad-card-top">
                <div>
                  <h3>{l.proprieteDite}</h3>
                  <span className="cad-ref">Titre {l.titreFoncier}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  <ConformiteBadge conforme={l.conforme} />
                  <StatutBadge statut={l.statut} />
                </div>
              </div>
              <div className="cad-kpis">
                <div className="cad-kpi"><span>Calculée</span><strong>{fmt(l.surfaceCalculeeM2, 0)} m²</strong></div>
                <div className="cad-kpi"><span>Document</span><strong>{fmt(l.surfaceDocumentM2, 0)} m²</strong></div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function HomeScreen({ reloadKey, onReview, onOpenLot, onExcel }) {
  return (
    <div className="cad">
      <Hero title="Cadastre">
        Transformez un plan de bornage en lot vérifié : import du PDF, contrôle des coordonnées, puis affichage sur la carte
        générale pour réutiliser l'existant sur vos nouveaux projets.
      </Hero>
      <Stepper step={0} />
      <ImportZone onReview={onReview} onExcel={onExcel} />
      <LotsList reloadKey={reloadKey} onOpenLot={onOpenLot} />
    </div>
  );
}

// --- Review (create / edit) ----------------------------------------------------

function Field({ label, required, hint, value, onChange, type = "text", missing }) {
  return (
    <label className="cad-field">
      <span>{label}{required && <span className="cad-req"> *</span>}</span>
      <input type={type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(e) => onChange(e.target.value)} className={missing ? "is-missing" : ""} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SelectField({ label, hint, value, onChange, children }) {
  return (
    <label className="cad-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ReviewScreen({ initial, onCancel, onSaved, projets = [], currentUser }) {
  const [header, setHeader] = useState(initial.header);
  const [projetId, setProjetId] = useState(initial.projetId || "");
  const [prestationId, setPrestationId] = useState(initial.prestationId || "");
  const projetPrestations = useMemo(() => projets.find((p) => p.id === projetId)?.prestations || [], [projets, projetId]);
  // Picking a projet suggests the prestation this survey most likely belongs to: the one assigned
  // to the current user, else the one already at the bureau step, else the only one.
  const changeProjet = (id) => {
    setProjetId(id);
    const list = projets.find((p) => p.id === id)?.prestations || [];
    const guess = list.find((p) => p.agentBureau && p.agentBureau === currentUser?.name) || list.find((p) => p.stage === "bureau") || (list.length === 1 ? list[0] : null);
    setPrestationId(guess ? guess.id : "");
  };
  const [surfaceDocumentM2, setSurfaceDocumentM2] = useState(initial.surfaceDocumentM2);
  const [correctionLambertM2, setCorrectionLambertM2] = useState(initial.correctionLambertM2);
  const [bornes, setBornes] = useState(initial.bornes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isEditing = Boolean(initial.lotId);

  const setBorne = (i, patch) => setBornes((p) => p.map((b, k) => (k === i ? { ...b, ...patch, flagged: false, flagReason: undefined } : b)));
  const flagged = bornes.filter((b) => b.flagged).length;
  const area = useMemo(() => previewArea(bornes), [bornes]);
  const ecart = area == null ? null : area + (Number(correctionLambertM2) || 0) - (Number(surfaceDocumentM2) || 0);

  const checks = [
    { ok: Boolean(header.titreFoncier.trim()), label: "Titre foncier renseigné" },
    { ok: Boolean(header.proprieteDite.trim()), label: "Propriété dite renseignée" },
    { ok: bornes.length >= 3, label: `Au moins 3 bornes (${bornes.length})` },
    { ok: flagged === 0, label: flagged ? `${flagged} borne${flagged > 1 ? "s" : ""} à vérifier` : "Aucune borne suspecte" },
  ];
  const blocking = checks.slice(0, 3).some((c) => !c.ok);

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      projet: projetId.trim() || null,
      prestation: projetId && prestationId ? prestationId : null,
      titreFoncier: header.titreFoncier,
      proprieteDite: header.proprieteDite,
      lotNumber: header.lot,
      geometre: header.geometre,
      surfaceDocumentM2: Number(surfaceDocumentM2) || 0,
      correctionLambertM2: Number(correctionLambertM2) || 0,
      bornes,
      distanceChecks: initial.distanceChecks,
      referencePoints: initial.referencePoints,
    };
    try {
      const lot = isEditing ? await updateCadastreLot(initial.lotId, payload) : await createCadastreLot(payload);
      onSaved(isEditing ? initial.lotId : lot.id);
    } catch (e) {
      setError(readApiError(e, "Échec de l'enregistrement."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cad">
      <button className="cad-btn" style={{ alignSelf: "flex-start" }} onClick={onCancel}><ArrowLeft size={16} /> Retour</button>
      <Hero title={isEditing ? "Modifier le lot" : "Vérifier le lot"}>{SOURCE_LABELS[initial.extractionMethod]}</Hero>
      <Stepper step={1} />

      <div className="cad-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <section className="cad-panel">
            <h2>Identification</h2>
            <div className="cad-fields">
              <Field label="Titre foncier" required value={header.titreFoncier} missing={!header.titreFoncier.trim()} onChange={(v) => setHeader((h) => ({ ...h, titreFoncier: v }))} />
              <Field label="Propriété dite" required value={header.proprieteDite} missing={!header.proprieteDite.trim()} onChange={(v) => setHeader((h) => ({ ...h, proprieteDite: v }))} />
              <Field label="Lot n°" value={header.lot} onChange={(v) => setHeader((h) => ({ ...h, lot: v }))} />
              <Field label="Géomètre" value={header.geometre} onChange={(v) => setHeader((h) => ({ ...h, geometre: v }))} />
              <Field label="Surface du document (m²)" type="number" value={surfaceDocumentM2} onChange={setSurfaceDocumentM2} />
              <Field label="Correction Lambert (m²)" type="number" value={correctionLambertM2} onChange={setCorrectionLambertM2} />
              <SelectField label="Projet lié" hint="Optionnel" value={projetId} onChange={changeProjet}>
                <option value="">— aucun —</option>
                {projets.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.situation}</option>)}
                {projetId && !projets.some((p) => p.id === projetId) && <option value={projetId}>{projetId}</option>}
              </SelectField>
              <SelectField label="Prestation" hint="Pour quelle prestation ce calcul est fait" value={prestationId} onChange={setPrestationId}>
                <option value="">— aucune —</option>
                {projetPrestations.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.natureDemandee || p.stage}</option>)}
              </SelectField>
            </div>
          </section>

          <section className="cad-panel">
            <div className="cad-top">
              <h2>Bornes · {bornes.length}</h2>
              <button className="cad-btn" onClick={() => setBornes((p) => [...p, { name: "", sequence: nextSequence(p), x: 0, y: 0, flagged: false }])}>
                <Plus size={16} /> Ajouter
              </button>
            </div>
            {bornes.length === 0 ? (
              <div className="cad-empty"><strong>Aucune borne</strong>Ajoutez au moins trois bornes pour former le polygone.</div>
            ) : (
              <table className="cad-bornes">
                <thead><tr><th>Nom</th><th>X Lambert</th><th>Y Lambert</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {bornes.map((b, i) => (
                    <React.Fragment key={i}>
                      <tr className={b.flagged ? "is-flagged" : ""}>
                        <td data-label="Nom"><input value={b.name} onChange={(e) => setBorne(i, { name: e.target.value })} aria-label={`Nom de la borne ${i + 1}`} /></td>
                        <td data-label="X Lambert"><input type="number" inputMode="decimal" value={b.x} onChange={(e) => setBorne(i, { x: Number(e.target.value) })} /></td>
                        <td data-label="Y Lambert"><input type="number" inputMode="decimal" value={b.y} onChange={(e) => setBorne(i, { y: Number(e.target.value) })} /></td>
                        <td style={{ width: 52 }}>
                          <button className="cad-btn danger" style={{ minHeight: 40, padding: "0 10px" }} onClick={() => setBornes((p) => p.filter((_, k) => k !== i))} aria-label={`Supprimer la borne ${b.name || i + 1}`}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                      {b.flagged && b.flagReason && (
                        <tr className="is-flagged"><td colSpan={4} style={{ padding: 0, border: 0 }}>
                          <div className="cad-flag"><AlertTriangle size={14} style={{ flex: "none", marginTop: 2 }} />{b.flagReason}</div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside className="cad-rail" aria-label="Contrôles">
          <section className="cad-panel">
            <h2>Avant d'enregistrer</h2>
            {checks.map((c) => (
              <div key={c.label} className={`cad-check ${c.ok ? "ok" : "todo"}`}><i>{c.ok ? "✓" : "!"}</i>{c.label}</div>
            ))}
          </section>
          <section className="cad-panel">
            <h2>Aperçu de la surface</h2>
            {area == null ? (
              <div className="cad-note">Renseignez 3 bornes pour calculer la surface.</div>
            ) : (
              <>
                <div className="cad-figure"><span>Calculée (bornes)</span><strong>{fmt(area)} m²</strong></div>
                <div className="cad-figure"><span>Document + correction</span><strong>{fmt((Number(surfaceDocumentM2) || 0) - (Number(correctionLambertM2) || 0))} m²</strong></div>
                <div className="cad-figure"><span>Écart</span><strong style={{ color: Math.abs(ecart) <= SURFACE_TOLERANCE_M2 ? "var(--status-success)" : "var(--status-danger)" }}>{ecart > 0 ? "+" : ""}{fmt(ecart)} m²</strong></div>
                <div className="cad-note">Tolérance : ±{SURFACE_TOLERANCE_M2} m². Un écart signale souvent un chiffre mal lu.</div>
              </>
            )}
          </section>
        </aside>
      </div>

      {error && <div className="cad-error" role="alert">{error}</div>}

      <div className="cad-actionbar">
        <span className="cad-note">{blocking ? "Complétez les contrôles pour enregistrer." : "Prêt à enregistrer."}</span>
        <button className="cad-btn" onClick={onCancel}>Annuler</button>
        <button className="cad-btn primary" disabled={saving || blocking} onClick={save}>
          {saving ? <Loader2 size={16} className="gt-spin-icon" /> : <CheckCircle2 size={16} />}
          {saving ? "Enregistrement…" : isEditing ? "Mettre à jour" : "Enregistrer le lot"}
        </button>
      </div>
    </div>
  );
}

// --- Detail --------------------------------------------------------------------

function lotToReviewInitial(lot) {
  return {
    extractionMethod: "edit",
    header: { titreFoncier: lot.titreFoncier, proprieteDite: lot.proprieteDite, lot: lot.lotNumber || "", geometre: lot.geometre || "" },
    bornes: lot.bornes.map((b) => ({ name: b.name, sequence: b.sequence, x: b.xLambert, y: b.yLambert, flagged: false })),
    surfaceDocumentM2: lot.surfaceDocumentM2,
    correctionLambertM2: lot.correctionLambertM2,
    projetId: lot.projet || "",
    prestationId: lot.prestation || "",
    distanceChecks: lot.distanceChecks.map((d) => ({ segmentLabel: d.segmentLabel, croquisM: d.croquisM })),
    referencePoints: lot.referencePoints.map((r) => ({ label: r.label, lat: r.lat, lng: r.lng })),
    lotId: lot.id,
  };
}

function LotDetail({ lotId, justSaved, onBack, onEdit, onDeleted, onShowOnMap, projets = [], getClient }) {
  const [lot, setLot] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [statutBusy, setStatutBusy] = useState(false);

  const makeReport = async () => {
    setReporting(true);
    try {
      const projet = projets.find((p) => p.id === lot.projet);
      await generateLotReport({
        lot,
        projet,
        client: projet && getClient ? getClient(projet.clientId) : null,
        prestation: projet?.prestations.find((p) => p.id === lot.prestation),
      });
      notifySuccess("Rapport cadastral généré");
    } catch {
      notifyError("Le rapport n'a pas pu être généré.");
    } finally {
      setReporting(false);
    }
  };

  const changeStatut = async (statut) => {
    setStatutBusy(true);
    setActionError(null);
    try {
      const updated = await setLotStatut(lotId, statut);
      setLot((l) => ({ ...l, statut: updated.statut, statutAt: updated.statut_at, statutParName: updated.statut_par_name || "" }));
    } catch (e) {
      setActionError(readApiError(e, "Changement de statut refusé."));
    } finally {
      setStatutBusy(false);
    }
  };
  const [geojson, setGeojson] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCadastreLot(lotId), getCadastreLotGeoJSON(lotId)])
      .then(([l, g]) => !cancelled && (setLot(l), setGeojson(g)))
      .catch((e) => !cancelled && setError(readApiError(e, "Échec du chargement.")));
    return () => { cancelled = true; };
  }, [lotId]);

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteCadastreLot(lotId);
      onDeleted();
    } catch (e) {
      setError(readApiError(e, "Échec de la suppression."));
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (error) return <div className="cad"><div className="cad-error" role="alert">{error}</div><button className="cad-btn" onClick={onBack}><ArrowLeft size={16} /> Retour</button></div>;
  if (!lot) return <div className="cad"><div className="cad-note">Chargement…</div></div>;

  const ecart = lot.surfaceCalculeeM2 + lot.correctionLambertM2 - lot.surfaceDocumentM2;

  return (
    <div className="cad">
      <div className="cad-top">
        <button className="cad-btn" onClick={onBack}><ArrowLeft size={16} /> Tous les lots</button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onShowOnMap && (
            <button className="cad-btn" onClick={() => onShowOnMap(lotId)}><MapPin size={16} /> Voir sur la carte</button>
          )}
          <button className="cad-btn primary" disabled={reporting} onClick={makeReport}>
            {reporting ? <Loader2 size={16} className="gt-spin-icon" /> : <FileDown size={16} />} Rapport PDF
          </button>
          <button className="cad-btn" onClick={() => onEdit(lotToReviewInitial(lot))}><Pencil size={16} /> Modifier</button>
          {confirming ? (
            <>
              <button className="cad-btn danger" disabled={deleting} onClick={remove}>
                {deleting ? <Loader2 size={16} className="gt-spin-icon" /> : <Trash2 size={16} />} Confirmer la suppression
              </button>
              <button className="cad-btn" onClick={() => setConfirming(false)} aria-label="Annuler la suppression"><X size={16} /></button>
            </>
          ) : (
            <button className="cad-btn danger" onClick={() => setConfirming(true)}><Trash2 size={16} /> Supprimer</button>
          )}
        </div>
      </div>

      <Stepper step={2} />
      {justSaved && <div className="cad-check ok" role="status"><i>✓</i>Lot enregistré. Il est désormais visible sur la carte générale (couche « Lots cadastraux »).</div>}

      <Hero eyebrow={`Titre foncier ${lot.titreFoncier}`} title={lot.proprieteDite}>
        {[lot.lotNumber && `Lot ${lot.lotNumber}`, lot.geometre, lot.projet && `Projet ${lot.projet}`, lot.prestation && `Prestation ${lot.prestation}`, lot.createdByName && `Saisi par ${lot.createdByName}`].filter(Boolean).join(" · ")}
      </Hero>

      <div className="cad-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <LotMap geojson={geojson} />
          <section className="cad-panel">
            <h2>Bornes · {lot.bornes.length}</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="cad-bornes">
                <thead><tr><th>Borne</th><th>X Lambert</th><th>Y Lambert</th><th>Lat, Lng</th></tr></thead>
                <tbody>
                  {lot.bornes.map((b) => (
                    <tr key={b.id}>
                      <td data-label="Borne"><strong>{b.name}</strong></td>
                      <td data-label="X Lambert" className="gt-mono">{fmt(b.xLambert, 3)}</td>
                      <td data-label="Y Lambert" className="gt-mono">{fmt(b.yLambert, 3)}</td>
                      <td data-label="Lat, Lng" className="gt-mono">{b.lat.toFixed(6)}, {b.lng.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="cad-rail">
          <section className="cad-panel">
            <div className="cad-top"><h2>Revue</h2><StatutBadge statut={lot.statut} /></div>
            {lot.statut !== "brouillon" && (
              <div className="cad-figure"><span>{STATUT_INFO[lot.statut].label} par</span><strong>{lot.statutParName || "—"}{lot.statutAt ? ` · ${new Date(lot.statutAt).toLocaleDateString("fr-FR")}` : ""}</strong></div>
            )}
            {actionError && <div className="cad-error" role="alert">{actionError}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {lot.statut === "brouillon" && <button className="cad-btn" disabled={statutBusy} onClick={() => changeStatut("verifie")}>Marquer vérifié</button>}
              {lot.statut === "verifie" && <button className="cad-btn primary" disabled={statutBusy} onClick={() => changeStatut("valide")}>Valider</button>}
              {lot.statut !== "brouillon" && <button className="cad-btn" disabled={statutBusy} onClick={() => changeStatut("brouillon")}>Remettre en brouillon</button>}
            </div>
            <small style={{ color: "var(--muted)" }}>Le bureau vérifie ; le contrôle valide. Modifier un lot le remet en brouillon.</small>
          </section>
          <section className="cad-panel">
            <div className="cad-top"><h2>Surface</h2><ConformiteBadge conforme={lot.conforme} /></div>
            <div className="cad-figure"><span>Calculée (bornes)</span><strong>{fmt(lot.surfaceCalculeeM2)} m²</strong></div>
            <div className="cad-figure"><span>Document</span><strong>{fmt(lot.surfaceDocumentM2)} m²</strong></div>
            <div className="cad-figure"><span>Correction Lambert</span><strong>{fmt(lot.correctionLambertM2)} m²</strong></div>
            <div className="cad-figure"><span>Écart</span><strong style={{ color: lot.conforme ? "var(--status-success)" : "var(--status-danger)" }}>{ecart > 0 ? "+" : ""}{fmt(ecart)} m²</strong></div>
          </section>
          {lot.distanceChecks.length > 0 && (
            <section className="cad-panel">
              <h2>Contrôle des distances</h2>
              {lot.distanceChecks.map((d) => (
                <div className="cad-figure" key={d.id}><span className="gt-mono">{d.segmentLabel}</span><strong style={{ color: Math.abs(d.ecartM) <= 0.1 ? "var(--status-success)" : "var(--status-danger)" }}>{d.ecartM > 0 ? "+" : ""}{d.ecartM.toFixed(2)} m</strong></div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// --- Entry point ---------------------------------------------------------------

/** PDF → OCR → vérification → lot cadastral. Rendered by GlobetudesProjets for view === "cadastre". */
export default function CadastreTool({ projets = [], currentUser, getClient, initialLotId = null, onShowOnMap }) {
  const [screen, setScreen] = useState(() => (initialLotId ? { name: "detail", id: initialLotId } : { name: "list" }));
  const [reloadKey, setReloadKey] = useState(0);

  if (screen.name === "review") {
    return (
      <ReviewScreen
        initial={screen.initial}
        projets={projets}
        currentUser={currentUser}
        onCancel={() => setScreen(screen.initial.lotId ? { name: "detail", id: screen.initial.lotId } : { name: "list" })}
        onSaved={(id) => { setReloadKey((k) => k + 1); setScreen({ name: "detail", id, justSaved: true }); }}
      />
    );
  }
  if (screen.name === "detail") {
    return (
      <LotDetail
        lotId={screen.id}
        projets={projets}
        getClient={getClient}
        onShowOnMap={onShowOnMap}
        justSaved={screen.justSaved}
        onBack={() => setScreen({ name: "list" })}
        onEdit={(initial) => setScreen({ name: "review", initial })}
        onDeleted={() => { setReloadKey((k) => k + 1); setScreen({ name: "list" }); }}
      />
    );
  }
  if (screen.name === "excel") {
    return (
      <ExcelImportScreen
        onBack={() => setScreen({ name: "list" })}
        onDone={() => { setReloadKey((k) => k + 1); setScreen({ name: "list" }); }}
      />
    );
  }
  return (
    <HomeScreen
      reloadKey={reloadKey}
      onReview={(initial) => setScreen({ name: "review", initial })}
      onOpenLot={(id) => setScreen({ name: "detail", id })}
      onExcel={() => setScreen({ name: "excel" })}
    />
  );
}
