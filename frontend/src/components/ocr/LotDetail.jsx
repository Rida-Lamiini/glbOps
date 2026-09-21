import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import LotMap from "./LotMap";
import VerificationPanel from "./VerificationPanel";
import { getCadastreLot, getCadastreLotGeoJSON, readApiError } from "./api";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export default function LotDetail({ lotId, onBack }) {
  const [lot, setLot] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLot(null);
    setGeojson(null);
    setError(null);
    (async () => {
      try {
        const [detail, features] = await Promise.all([
          getCadastreLot(lotId),
          getCadastreLotGeoJSON(lotId),
        ]);
        if (cancelled) return;
        setLot(detail);
        setGeojson(features);
      } catch (err) {
        if (!cancelled) setError(readApiError(err, "Impossible de charger ce lot."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  if (error) {
    return (
      <div className="gt-ocr">
        <button type="button" className="gt-btn gt-btn-neutral" onClick={onBack}>
          <ArrowLeft size={13} /> Retour
        </button>
        <p className="gt-ocr-warn">{error}</p>
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="gt-ocr">
        <p className="gt-ocr-sub">Chargement…</p>
      </div>
    );
  }

  const meta = [
    ["Géomètre", lot.geometre || "—"],
    ["Date de levé", fmtDate(lot.dateLeve)],
    ["Service du cadastre", lot.serviceCadastre || "—"],
    ["Affaire", lot.affaireRef || "—"],
  ];

  return (
    <div className="gt-ocr">
      <div className="gt-ocr-head">
        <div>
          <h2 className="gt-ocr-title">{lot.proprieteDite}</h2>
          <p className="gt-ocr-sub">
            Titre foncier {lot.titreFoncier}
            {lot.lotNumber ? ` · Lot ${lot.lotNumber}` : ""}
          </p>
        </div>
        <button type="button" className="gt-btn gt-btn-neutral" onClick={onBack}>
          <ArrowLeft size={13} /> Retour
        </button>
      </div>

      <section className="gt-section">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            fontSize: 12.5,
          }}
        >
          {meta.map(([label, value]) => (
            <div key={label}>
              <div style={{ color: "var(--muted)", fontSize: 11 }}>{label}</div>
              <div style={{ color: "var(--ink)" }}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      {geojson && <LotMap geojson={geojson} />}

      <VerificationPanel
        surfaceDocumentM2={lot.surfaceDocumentM2}
        surfaceCalculeeM2={lot.surfaceCalculeeM2}
        correctionLambertM2={lot.correctionLambertM2}
        bornes={lot.bornes}
        distanceChecks={lot.distanceChecks}
      />

      <section className="gt-section">
        <h4>Bornes</h4>
        <table className="gt-ocr-table">
          <thead>
            <tr>
              <th>Borne</th>
              <th className="num">X (Lambert)</th>
              <th className="num">Y (Lambert)</th>
              <th className="num">Latitude</th>
              <th className="num">Longitude</th>
            </tr>
          </thead>
          <tbody>
            {lot.bornes.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td className="num">{b.xLambert.toFixed(3)}</td>
                <td className="num">{b.yLambert.toFixed(3)}</td>
                <td className="num">{b.lat.toFixed(7)}</td>
                <td className="num">{b.lng.toFixed(7)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {lot.referencePoints.length > 0 && (
        <section className="gt-section">
          <h4>Points de référence</h4>
          <table className="gt-ocr-table">
            <thead>
              <tr>
                <th>Libellé</th>
                <th className="num">Distance (m)</th>
                <th className="num">Azimut (°)</th>
              </tr>
            </thead>
            <tbody>
              {lot.referencePoints.map((rp) => (
                <tr key={rp.id}>
                  <td>{rp.label}</td>
                  <td className="num">{rp.distanceM.toFixed(1)}</td>
                  <td className="num">{rp.bearingDeg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
