import React, { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import PdfUploadPanel from "./PdfUploadPanel";
import BorneTable, { emptyBorneRow } from "./BorneTable";
import DistanceCheckTable from "./DistanceCheckTable";
import ReferencePointTable from "./ReferencePointTable";
import { createCadastreLot, readApiError } from "./api";
import {
  SURFACE_CONFORMITY_TOLERANCE_M2,
  fmt,
  planarShoelaceAreaM2,
  shoelaceAreaSensitivity,
} from "./geo";

const emptyHeader = {
  titreFoncier: "",
  proprieteDite: "",
  lotNumber: "",
  affaireRef: "",
  geometre: "",
  dateLeve: "",
  serviceCadastre: "",
  surfaceDocumentM2: "",
  correctionLambertM2: "0",
};

// Above this, the area cross-check has a real blind spot on this lot's shape and
// the user needs to be told so rather than trusting a green result.
const SENSITIVITY_WARNING_THRESHOLD_M = 2;

export default function NewLot({ onSaved, onCancel }) {
  const [header, setHeader] = useState(emptyHeader);
  const [bornes, setBornes] = useState([emptyBorneRow(), emptyBorneRow(), emptyBorneRow()]);
  const [distanceChecks, setDistanceChecks] = useState([]);
  const [referencePoints, setReferencePoints] = useState([]);
  const [extraction, setExtraction] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const setField = (key, value) => setHeader((prev) => ({ ...prev, [key]: value }));

  function applyParsed(result) {
    setHeader((prev) => ({
      ...prev,
      titreFoncier: result.header.titreFoncier ?? prev.titreFoncier,
      proprieteDite: result.header.proprieteDite ?? prev.proprieteDite,
      lotNumber: result.header.lot ?? prev.lotNumber,
      affaireRef: result.header.natureAffaire ?? prev.affaireRef,
      geometre: result.header.geometre ?? prev.geometre,
      surfaceDocumentM2:
        result.header.contenanceAdopteeM2 != null
          ? String(result.header.contenanceAdopteeM2)
          : prev.surfaceDocumentM2,
      correctionLambertM2:
        result.header.correctionLambertM2 != null
          ? String(result.header.correctionLambertM2)
          : prev.correctionLambertM2,
    }));

    if (result.bornes.length > 0) {
      setBornes(
        result.bornes.map((b) => ({
          name: b.name,
          xLambert: String(b.x),
          yLambert: String(b.y),
          flagged: b.flagged,
          flagReason: b.flagReason,
        })),
      );
    }

    setExtraction({
      method: result.extractionMethod,
      rawText: result.rawOcrText,
      systeme: result.header.systeme,
      surfaceCalculeeDoc: result.header.surfaceCalculeeM2,
      surfaceCorrigeeDoc: result.header.surfaceCorrigeeM2,
      dateDoc: result.header.date,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);

    const parsedBornes = bornes
      .filter((b) => b.name.trim() && b.xLambert.trim() && b.yLambert.trim())
      .map((b, i) => ({
        name: b.name.trim(),
        sequence: i,
        xLambert: Number(b.xLambert),
        yLambert: Number(b.yLambert),
      }));

    if (parsedBornes.length < 3) {
      setSubmitError("Un polygone nécessite au moins 3 bornes valides.");
      return;
    }
    if (parsedBornes.some((b) => !Number.isFinite(b.xLambert) || !Number.isFinite(b.yLambert))) {
      setSubmitError("Certaines coordonnées ne sont pas des nombres valides.");
      return;
    }
    if (!header.titreFoncier.trim() || !header.proprieteDite.trim()) {
      setSubmitError("Le titre foncier et la propriété dite sont obligatoires.");
      return;
    }

    setSubmitting(true);
    try {
      const { id } = await createCadastreLot({
        titreFoncier: header.titreFoncier.trim(),
        proprieteDite: header.proprieteDite.trim(),
        lotNumber: header.lotNumber.trim(),
        affaireRef: header.affaireRef.trim(),
        geometre: header.geometre.trim(),
        dateLeve: header.dateLeve,
        serviceCadastre: header.serviceCadastre.trim(),
        surfaceDocumentM2: Number(header.surfaceDocumentM2 || 0),
        correctionLambertM2: Number(header.correctionLambertM2 || 0),
        bornes: parsedBornes,
        distanceChecks: distanceChecks
          .filter((dc) => dc.segmentLabel.trim() && dc.croquisM.trim())
          .map((dc) => ({ segmentLabel: dc.segmentLabel.trim(), croquisM: Number(dc.croquisM) })),
        referencePoints: referencePoints
          .filter((rp) => rp.label.trim() && rp.lat.trim() && rp.lng.trim())
          .map((rp) => ({ label: rp.label.trim(), lat: Number(rp.lat), lng: Number(rp.lng) })),
      });
      onSaved(id);
    } catch (err) {
      setSubmitError(readApiError(err, "Échec de l'enregistrement. Réessayez."));
    } finally {
      setSubmitting(false);
    }
  }

  const flaggedCount = bornes.filter((b) => b.flagged).length;
  const systemeWarning = extraction?.systeme && !/lambert/i.test(extraction.systeme);

  // Recomputed live from whatever's currently in the borne table (including
  // in-progress corrections), independent of which individual rows got flagged —
  // a small per-borne coordinate error can be too small to trip the X/Y outlier
  // check or the distance cross-check (which needs several sketch distances to
  // have OCR'd cleanly to say anything at all), but it still throws off the
  // shoelace area, and the document's own "S" value is already sitting right
  // there to compare against.
  const validBornePoints = useMemo(
    () =>
      bornes
        .filter((b) => b.xLambert.trim() && b.yLambert.trim())
        .map((b) => ({ name: b.name || "?", x: Number(b.xLambert), y: Number(b.yLambert) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    [bornes],
  );

  const computedAreaM2 =
    validBornePoints.length >= 3 ? planarShoelaceAreaM2(validBornePoints) : null;
  const surfaceCrossCheck =
    computedAreaM2 !== null && extraction?.surfaceCalculeeDoc != null
      ? {
          computed: computedAreaM2,
          document: extraction.surfaceCalculeeDoc,
          delta: computedAreaM2 - extraction.surfaceCalculeeDoc,
        }
      : null;
  const surfaceMismatch = surfaceCrossCheck
    ? Math.abs(surfaceCrossCheck.delta) > SURFACE_CONFORMITY_TOLERANCE_M2
    : false;

  // A 1 m² area tolerance isn't equally sensitive at every vertex — how large a
  // coordinate error at a given borne has to be before it moves the area by 1 m²
  // depends on how close that borne's two neighbours are on the other axis (see
  // shoelaceAreaSensitivity). Surface the worst case for THIS lot's actual shape
  // so a thin/degenerate polygon with a real blind spot is visible, rather than
  // silently assuming the area check above catches everything.
  const worstSensitivity = useMemo(() => {
    if (validBornePoints.length < 3) return null;
    let worst = { minDetectableM: 0, borneName: "" };
    shoelaceAreaSensitivity(validBornePoints).forEach((s) => {
      const minDetX =
        Math.abs(s.dAreaPerDx) > 0
          ? SURFACE_CONFORMITY_TOLERANCE_M2 / Math.abs(s.dAreaPerDx)
          : Infinity;
      const minDetY =
        Math.abs(s.dAreaPerDy) > 0
          ? SURFACE_CONFORMITY_TOLERANCE_M2 / Math.abs(s.dAreaPerDy)
          : Infinity;
      const weakest = Math.max(minDetX, minDetY);
      if (weakest > worst.minDetectableM) {
        worst = { minDetectableM: weakest, borneName: validBornePoints[s.index].name };
      }
    });
    return worst;
  }, [validBornePoints]);
  const sensitivityGap =
    worstSensitivity && worstSensitivity.minDetectableM > SENSITIVITY_WARNING_THRESHOLD_M;

  const field = (key, label, extra = {}) => (
    <label className="gt-ocr-field">
      <span>{label}</span>
      <input
        value={header[key]}
        onChange={(e) => setField(key, e.target.value)}
        {...extra}
      />
    </label>
  );

  return (
    <div className="gt-ocr">
      <div className="gt-ocr-head">
        <div>
          <h2 className="gt-ocr-title">Nouveau lot</h2>
          <p className="gt-ocr-sub">
            Importez le PDF, relisez les valeurs extraites, puis enregistrez.
          </p>
        </div>
        <button type="button" className="gt-btn gt-btn-neutral" onClick={onCancel}>
          <ArrowLeft size={13} /> Retour
        </button>
      </div>

      <PdfUploadPanel onParsed={applyParsed} />

      {extraction && (
        <section className="gt-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h4 style={{ margin: 0 }}>Résultat de l'extraction</h4>

          <div style={{ fontSize: 12.5 }}>
            <span style={{ color: "var(--muted)" }}>Méthode : </span>
            <span
              style={{ color: extraction.method === "ocr" ? "var(--bad)" : "var(--status-success)" }}
            >
              {extraction.method === "ocr" ? "OCR (document scanné)" : "Texte natif du PDF"}
            </span>
          </div>

          {extraction.method === "ocr" && (
            <p className="gt-ocr-warn">
              Document scanné — toutes les valeurs ci-dessous sont issues d'une reconnaissance
              automatique et doivent être vérifiées avant d'enregistrer.
            </p>
          )}

          {flaggedCount > 0 && (
            <p className="gt-ocr-warn">
              {flaggedCount} borne{flaggedCount > 1 ? "s" : ""} signalée
              {flaggedCount > 1 ? "s" : ""} comme suspecte{flaggedCount > 1 ? "s" : ""} dans le
              tableau ci-dessous.
            </p>
          )}

          {systemeWarning && (
            <p className="gt-ocr-warn">
              Système lu sur le document : « {extraction.systeme} » — attendu « LAMBERT ». Vérifiez
              la projection.
            </p>
          )}

          {(extraction.surfaceCalculeeDoc != null || extraction.surfaceCorrigeeDoc != null) && (
            <dl className="gt-ocr-dl">
              {extraction.surfaceCalculeeDoc != null && (
                <>
                  <dt>S (document)</dt>
                  <dd>{fmt(extraction.surfaceCalculeeDoc)} m²</dd>
                </>
              )}
              {extraction.surfaceCorrigeeDoc != null && (
                <>
                  <dt>Surface corrigée (document)</dt>
                  <dd>{fmt(extraction.surfaceCorrigeeDoc)} m²</dd>
                </>
              )}
            </dl>
          )}

          {surfaceCrossCheck && (
            <p className={`gt-ocr-note ${surfaceMismatch ? "bad" : "ok"}`}>
              {surfaceMismatch ? (
                <>
                  <strong>Surface recalculée ne correspond pas au document :</strong>{" "}
                  {fmt(surfaceCrossCheck.computed)} m² calculés à partir des bornes ci-dessous vs{" "}
                  {fmt(surfaceCrossCheck.document)} m² sur le document (écart{" "}
                  {surfaceCrossCheck.delta >= 0 ? "+" : ""}
                  {fmt(surfaceCrossCheck.delta)} m²). Au moins une coordonnée est probablement
                  erronée, même si aucune ligne n'est signalée ci-dessous — comparez avec le texte
                  OCR brut ou le document original.
                </>
              ) : (
                <>
                  Surface recalculée conforme au document (écart{" "}
                  {surfaceCrossCheck.delta >= 0 ? "+" : ""}
                  {fmt(surfaceCrossCheck.delta)} m²).
                </>
              )}
            </p>
          )}

          {worstSensitivity &&
            (sensitivityGap ? (
              <p className="gt-ocr-note bad">
                <strong>Contrôle de surface peu sensible pour {worstSensitivity.borneName} :</strong>{" "}
                {Number.isFinite(worstSensitivity.minDetectableM) ? (
                  <>
                    sur la géométrie actuelle, une erreur de coordonnée inférieure à{" "}
                    {worstSensitivity.minDetectableM.toFixed(1)} m sur cette borne ne changerait pas
                    la surface recalculée de plus de {SURFACE_CONFORMITY_TOLERANCE_M2} m² — le
                    contrôle ci-dessus ne la détecterait pas.
                  </>
                ) : (
                  // Derivative of the area w.r.t. this vertex is exactly zero on at least one axis
                  // (its two neighbours share that coordinate), so no error there — of any size —
                  // moves the shoelace area. "inférieure à Infinity m" would be nonsense.
                  <>
                    sur la géométrie actuelle, la surface recalculée ne dépend pas de cette borne :
                    une erreur de coordonnée sur elle, quelle que soit son ampleur, ne changerait pas
                    la surface et ne serait donc jamais détectée par le contrôle ci-dessus.
                  </>
                )}{" "}
                Vérifiez cette borne plus attentivement.
              </p>
            ) : (
              <p className="gt-ocr-sub" style={{ margin: 0 }}>
                Sensibilité du contrôle de surface : toute erreur ≥{" "}
                {worstSensitivity.minDetectableM.toFixed(2)} m sur n'importe quelle borne serait
                détectée ci-dessus.
              </p>
            ))}

          {extraction.dateDoc && (
            <p className="gt-ocr-sub" style={{ margin: 0 }}>
              Date lue sur le document : <strong>{extraction.dateDoc}</strong> — à reporter
              manuellement dans « Date de levé » ci-dessous (jour non lisible automatiquement).
            </p>
          )}

          <details>
            <summary style={{ cursor: "pointer", color: "var(--accent)", fontSize: 12.5 }}>
              Texte brut extrait (pour vérification)
            </summary>
            <pre className="gt-ocr-raw">{extraction.rawText || "(vide)"}</pre>
          </details>
        </section>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <section className="gt-section">
          <h4>Informations générales</h4>
          <div className="gt-ocr-grid">
            <label className="gt-ocr-field">
              <span>Titre foncier *</span>
              <input
                className={extraction ? "flagged" : ""}
                value={header.titreFoncier}
                onChange={(e) => setField("titreFoncier", e.target.value)}
                required
              />
              {extraction && (
                <span style={{ color: "var(--bad)", fontSize: 11 }}>
                  À confirmer manuellement — ce champ est généralement manuscrit sur le document.
                </span>
              )}
            </label>
            <label className="gt-ocr-field">
              <span>Propriété dite *</span>
              <input
                value={header.proprieteDite}
                onChange={(e) => setField("proprieteDite", e.target.value)}
                required
              />
            </label>
            {field("lotNumber", "Lot n°")}
            {field("affaireRef", "Affaire")}
            {field("geometre", "Géomètre")}
            {field("dateLeve", "Date de levé", { type: "date" })}
            {field("serviceCadastre", "Service du cadastre")}
            <label className="gt-ocr-field">
              <span>Contenance adoptée (m²) *</span>
              <input
                value={header.surfaceDocumentM2}
                onChange={(e) => setField("surfaceDocumentM2", e.target.value)}
                inputMode="decimal"
                required
              />
            </label>
            {field("correctionLambertM2", "Correction Lambert (m²)", { inputMode: "decimal" })}
          </div>
        </section>

        <section className="gt-section">
          <h4>Bornes (ordre du périmètre)</h4>
          <BorneTable rows={bornes} onChange={setBornes} />
        </section>

        <section className="gt-section">
          <h4>Contrôles de distance</h4>
          <DistanceCheckTable rows={distanceChecks} onChange={setDistanceChecks} />
        </section>

        <section className="gt-section">
          <h4>Points de référence</h4>
          <ReferencePointTable rows={referencePoints} onChange={setReferencePoints} />
        </section>

        {submitError && <p className="gt-ocr-warn">{submitError}</p>}

        <div>
          <button type="submit" className="gt-btn gt-btn-primary" disabled={submitting}>
            {submitting ? "Enregistrement…" : "Enregistrer le lot"}
          </button>
        </div>
      </form>
    </div>
  );
}
