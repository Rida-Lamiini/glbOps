import React, { useEffect, useState } from "react";
import { ScanText, Upload, Loader2, ArrowLeft, Trash2, Plus, CheckCircle2, AlertTriangle, Pencil, FilePlus2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  parseCadastrePdf,
  listCadastreLots,
  getCadastreLot,
  getCadastreLotGeoJSON,
  createCadastreLot,
  updateCadastreLot,
  deleteCadastreLot,
  readApiError,
} from "./api";
import LotMap from "./LotMap";

const EMPTY_INITIAL = {
  extractionMethod: "manual",
  header: { titreFoncier: "", proprieteDite: "", lot: "", geometre: "" },
  bornes: [],
  surfaceDocumentM2: "",
  correctionLambertM2: 0,
  projetId: "",
  distanceChecks: [],
  referencePoints: [],
  lotId: null,
};

const EXTRACTION_LABELS = {
  ocr: "lu par OCR — à vérifier",
  "text-layer": "texte natif du PDF",
  manual: "saisie manuelle",
  edit: "modification d'un lot existant",
};

const HEADER_FIELDS = [
  { key: "titreFoncier", label: "Titre foncier", required: true },
  { key: "proprieteDite", label: "Propriété dite", required: true },
  { key: "lot", label: "Lot n°" },
  { key: "geometre", label: "Géomètre" },
];

function nextSequence(bornes) {
  return bornes.length === 0 ? 0 : Math.max(...bornes.map((b) => b.sequence)) + 1;
}

// --- Upload + review -------------------------------------------------------

function UploadPanel({ onReview }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pick = async (file) => {
    if (!file) return;
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
        distanceChecks: [],
        referencePoints: [],
        lotId: null,
      });
    } catch (e) {
      setError(readApiError(e, "Échec de l'analyse du PDF. Vous pouvez saisir les bornes manuellement."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gt-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ScanText size={18} />
        <strong>Analyser un Calcul de Contenances (PDF)</strong>
      </div>
      <div className="gt-attach-note">
        Le document est d'abord lu directement (texte natif) ; s'il s'agit d'un scan sans
        texte (le cas le plus courant pour ces documents ANCFCC), chaque page est envoyée
        au service OCR. Les valeurs extraites restent à vérifier avant enregistrement.
      </div>
      <div className="gt-formrow" style={{ gap: 10 }}>
        <label className="gt-btn gt-btn-neutral gt-attach-uploadbtn" style={{ alignSelf: "flex-start" }}>
          {loading ? <Loader2 size={14} className="gt-spin-icon" /> : <Upload size={14} />}
          {loading ? "Analyse en cours… (peut prendre 1-2 min si OCR)" : "Choisir un PDF"}
          <input type="file" accept="application/pdf" disabled={loading} onChange={(e) => { pick(e.target.files[0]); e.target.value = ""; }} />
        </label>
        <button className="gt-btn gt-btn-neutral" onClick={() => onReview(EMPTY_INITIAL)}>
          <FilePlus2 size={14} /> Saisir un lot manuellement
        </button>
      </div>
      {error && <div style={{ color: "var(--status-danger)" }}>{error}</div>}
    </div>
  );
}

function FlagBadge({ borne }) {
  if (!borne.flagged) return null;
  return (
    <span title={borne.flagReason} style={{ display: "inline-flex", color: "var(--status-warning)" }}>
      <AlertTriangle size={14} />
    </span>
  );
}

function ReviewScreen({ initial, onCancel, onSaved }) {
  const [header, setHeader] = useState(initial.header);
  const [projetId, setProjetId] = useState(initial.projetId || "");
  const [surfaceDocumentM2, setSurfaceDocumentM2] = useState(initial.surfaceDocumentM2);
  const [correctionLambertM2, setCorrectionLambertM2] = useState(initial.correctionLambertM2);
  const [bornes, setBornes] = useState(initial.bornes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isEditing = Boolean(initial.lotId);

  const updateBorne = (index, patch) => {
    setBornes((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch, flagged: false, flagReason: undefined } : b)));
  };
  const removeBorne = (index) => setBornes((prev) => prev.filter((_, i) => i !== index));
  const addBorne = () =>
    setBornes((prev) => [...prev, { name: "", sequence: nextSequence(prev), x: 0, y: 0, flagged: false }]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      projet: projetId.trim() || null,
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
      const lot = isEditing
        ? await updateCadastreLot(initial.lotId, payload)
        : await createCadastreLot(payload);
      onSaved(isEditing ? initial.lotId : lot.id);
    } catch (e) {
      setError(readApiError(e, "Échec de l'enregistrement."));
    } finally {
      setSaving(false);
    }
  };

  const flaggedCount = bornes.filter((b) => b.flagged).length;

  const missingReasons = [
    !header.titreFoncier.trim() && "le titre foncier",
    !header.proprieteDite.trim() && "la propriété dite",
    bornes.length < 3 && "au moins 3 bornes",
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button className="gt-btn gt-btn-neutral" style={{ alignSelf: "flex-start" }} onClick={onCancel}>
        <ArrowLeft size={14} /> Annuler
      </button>

      <div className="gt-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <strong>
          {isEditing ? "Modifier le lot" : "Nouveau lot"} ({EXTRACTION_LABELS[initial.extractionMethod] || initial.extractionMethod})
        </strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {HEADER_FIELDS.map((f) => (
            <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
              <span>
                {f.label}
                {f.required && <span style={{ color: "var(--status-danger)" }}> *</span>}
              </span>
              <input
                value={header[f.key]}
                onChange={(e) => setHeader((h) => ({ ...h, [f.key]: e.target.value }))}
                style={f.required && !header[f.key].trim() ? { borderColor: "var(--status-warning)" } : undefined}
              />
            </label>
          ))}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            Surface document (m²)
            <input type="number" value={surfaceDocumentM2} onChange={(e) => setSurfaceDocumentM2(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            Correction Lambert (m²)
            <input type="number" value={correctionLambertM2} onChange={(e) => setCorrectionLambertM2(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            Projet lié (optionnel — ex. PRJ-2026-001)
            <input value={projetId} onChange={(e) => setProjetId(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="gt-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <strong>Bornes ({bornes.length})</strong>
          {flaggedCount > 0 && (
            <Badge variant="outline" style={{ color: "var(--status-warning)" }}>
              {flaggedCount} à vérifier
            </Badge>
          )}
        </div>
        <div className="gt-table-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>X (Lambert)</TableHead>
                <TableHead>Y (Lambert)</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bornes.map((b, i) => (
                <TableRow key={i} style={b.flagged ? { background: "var(--status-warning-bg, #fff8e6)" } : undefined}>
                  <TableCell>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input style={{ width: 90 }} value={b.name} onChange={(e) => updateBorne(i, { name: e.target.value })} />
                      <FlagBadge borne={b} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <input type="number" style={{ width: 110 }} value={b.x} onChange={(e) => updateBorne(i, { x: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell>
                    <input type="number" style={{ width: 110 }} value={b.y} onChange={(e) => updateBorne(i, { y: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell>
                    <button className="gt-iconbtn" onClick={() => removeBorne(i)}><Trash2 size={13} /></button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <button className="gt-btn gt-btn-neutral" style={{ alignSelf: "flex-start" }} onClick={addBorne}>
          <Plus size={14} /> Ajouter une borne
        </button>
      </div>

      {error && <div style={{ color: "var(--status-danger)" }}>{error}</div>}

      <button
        className="gt-newbtn"
        style={{ alignSelf: "flex-start" }}
        disabled={saving || missingReasons.length > 0}
        onClick={save}
      >
        {saving ? <Loader2 size={15} className="gt-spin-icon" /> : <CheckCircle2 size={15} />}
        {saving ? "Enregistrement…" : isEditing ? "Mettre à jour le lot" : "Enregistrer le lot"}
      </button>
      {missingReasons.length > 0 && (
        <div className="gt-attach-note">
          Il manque : {missingReasons.join(", ")}{initial.extractionMethod !== "manual" && " — le PDF ne les a pas lus clairement"}, complétez-les ci-dessus.
        </div>
      )}
    </div>
  );
}

// --- Lot detail --------------------------------------------------------

function ConformiteBadge({ conforme }) {
  return conforme ? (
    <Badge style={{ background: "var(--status-success-bg, #e6f6ee)", color: "var(--good)" }}>Conforme</Badge>
  ) : (
    <Badge style={{ background: "var(--status-danger-bg)", color: "var(--status-danger)" }}>Écart</Badge>
  );
}

function lotToReviewInitial(lot) {
  return {
    extractionMethod: "edit",
    header: {
      titreFoncier: lot.titreFoncier,
      proprieteDite: lot.proprieteDite,
      lot: lot.lotNumber || "",
      geometre: lot.geometre || "",
    },
    bornes: lot.bornes.map((b) => ({ name: b.name, sequence: b.sequence, x: b.xLambert, y: b.yLambert, flagged: false })),
    surfaceDocumentM2: lot.surfaceDocumentM2,
    correctionLambertM2: lot.correctionLambertM2,
    projetId: lot.projet || "",
    distanceChecks: lot.distanceChecks.map((dc) => ({ segmentLabel: dc.segmentLabel, croquisM: dc.croquisM })),
    referencePoints: lot.referencePoints.map((rp) => ({ label: rp.label, lat: rp.lat, lng: rp.lng })),
    lotId: lot.id,
  };
}

function LotDetail({ lotId, onBack, onEdit, onDeleted }) {
  const [lot, setLot] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCadastreLot(lotId), getCadastreLotGeoJSON(lotId)])
      .then(([l, g]) => {
        if (cancelled) return;
        setLot(l);
        setGeojson(g);
      })
      .catch((e) => !cancelled && setError(readApiError(e, "Échec du chargement.")));
    return () => { cancelled = true; };
  }, [lotId]);

  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement le lot "${lot.proprieteDite}" (titre foncier ${lot.titreFoncier}) ?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCadastreLot(lotId);
      onDeleted();
    } catch (e) {
      setError(readApiError(e, "Échec de la suppression."));
      setDeleting(false);
    }
  };

  if (error) return <div style={{ color: "var(--status-danger)" }}>{error}</div>;
  if (!lot) return <div className="gt-attach-note">Chargement…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="gt-formrow" style={{ justifyContent: "space-between" }}>
        <button className="gt-btn gt-btn-neutral" onClick={onBack}>
          <ArrowLeft size={14} /> Retour
        </button>
        <div className="gt-formrow" style={{ gap: 8 }}>
          <button className="gt-btn gt-btn-neutral" onClick={() => onEdit(lotToReviewInitial(lot))}>
            <Pencil size={14} /> Modifier
          </button>
          <button className="gt-btn gt-btn-neutral" style={{ color: "var(--status-danger)" }} disabled={deleting} onClick={remove}>
            {deleting ? <Loader2 size={14} className="gt-spin-icon" /> : <Trash2 size={14} />} Supprimer
          </button>
        </div>
      </div>
      <div className="gt-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong>{lot.proprieteDite}</strong>
          <ConformiteBadge conforme={lot.conforme} />
        </div>
        <div className="gt-attach-note">
          Titre foncier {lot.titreFoncier} · Surface calculée {lot.surfaceCalculeeM2.toFixed(2)} m² (document : {lot.surfaceDocumentM2.toFixed(2)} m²)
          {lot.projet && <> · Projet {lot.projet}</>}
        </div>
      </div>
      <LotMap geojson={geojson} />
      <div className="gt-table-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Borne</TableHead>
              <TableHead>X (Lambert)</TableHead>
              <TableHead>Y (Lambert)</TableHead>
              <TableHead>Lat / Lng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lot.bornes.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.name}</TableCell>
                <TableCell>{b.xLambert.toFixed(3)}</TableCell>
                <TableCell>{b.yLambert.toFixed(3)}</TableCell>
                <TableCell>{b.lat.toFixed(6)}, {b.lng.toFixed(6)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- Lots list -----------------------------------------------------------

function LotsList({ reloadKey, onOpenLot }) {
  const [lots, setLots] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listCadastreLots(query)
      .then((data) => !cancelled && setLots(data))
      .catch((e) => !cancelled && setError(readApiError(e, "Échec du chargement des lots.")));
    return () => { cancelled = true; };
  }, [query, reloadKey]);

  return (
    <div className="gt-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong>Lots cadastraux enregistrés</strong>
        <input placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 220 }} />
      </div>
      {error && <div style={{ color: "var(--status-danger)" }}>{error}</div>}
      {!lots ? (
        <div className="gt-attach-note">Chargement…</div>
      ) : lots.length === 0 ? (
        <div className="gt-list-empty">Aucun lot enregistré pour l'instant.</div>
      ) : (
        <div className="gt-table-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre foncier</TableHead>
                <TableHead>Propriété dite</TableHead>
                <TableHead>Surface calculée</TableHead>
                <TableHead>Conformité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((l) => (
                <TableRow key={l.id} style={{ cursor: "pointer" }} onClick={() => onOpenLot(l.id)}>
                  <TableCell>{l.titreFoncier}</TableCell>
                  <TableCell>{l.proprieteDite}</TableCell>
                  <TableCell>{l.surfaceCalculeeM2.toFixed(2)} m²</TableCell>
                  <TableCell><ConformiteBadge conforme={l.conforme} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// --- Entry point -----------------------------------------------------------

/**
 * PDF → OCR → borne table → cadastral lot. Everything the feature owns lives
 * under components/cadastre/, mirroring how the rest of the app keeps each
 * view self-contained; GlobetudesProjets renders this for view === "cadastre".
 */
export default function CadastreTool() {
  const [screen, setScreen] = useState({ name: "list" });
  const [reloadKey, setReloadKey] = useState(0);

  if (screen.name === "review") {
    return (
      <ReviewScreen
        initial={screen.initial}
        onCancel={() => setScreen(screen.initial.lotId ? { name: "detail", id: screen.initial.lotId } : { name: "list" })}
        onSaved={(id) => {
          setReloadKey((k) => k + 1);
          setScreen({ name: "detail", id });
        }}
      />
    );
  }

  if (screen.name === "detail") {
    return (
      <LotDetail
        lotId={screen.id}
        onBack={() => setScreen({ name: "list" })}
        onEdit={(initial) => setScreen({ name: "review", initial })}
        onDeleted={() => {
          setReloadKey((k) => k + 1);
          setScreen({ name: "list" });
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
      <UploadPanel onReview={(initial) => setScreen({ name: "review", initial })} />
      <LotsList reloadKey={reloadKey} onOpenLot={(id) => setScreen({ name: "detail", id })} />
    </div>
  );
}
