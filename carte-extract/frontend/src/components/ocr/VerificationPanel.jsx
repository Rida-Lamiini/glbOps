import React from "react";
import ConformiteBadge from "./ConformiteBadge";
import { fmt, isDistanceConforme, isSurfaceConforme, planarPerimeterM } from "./geo";

export default function VerificationPanel({
  surfaceDocumentM2,
  surfaceCalculeeM2,
  correctionLambertM2,
  bornes,
  distanceChecks,
}) {
  const perimeterM = planarPerimeterM(bornes.map((b) => ({ x: b.xLambert, y: b.yLambert })));
  const surfaceEcart = surfaceCalculeeM2 + correctionLambertM2 - surfaceDocumentM2;
  const surfaceOk = isSurfaceConforme(surfaceCalculeeM2, correctionLambertM2, surfaceDocumentM2);

  return (
    <>
      <section className="gt-section">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h4 style={{ margin: 0 }}>Vérification de surface</h4>
          <ConformiteBadge conforme={surfaceOk} />
        </div>
        <dl className="gt-ocr-dl">
          <dt>Surface calculée (bornes)</dt>
          <dd>{fmt(surfaceCalculeeM2)} m²</dd>
          <dt>Correction Lambert</dt>
          <dd>
            {correctionLambertM2 >= 0 ? "+" : ""}
            {fmt(correctionLambertM2)} m²
          </dd>
          <dt>Contenance adoptée (document)</dt>
          <dd>{fmt(surfaceDocumentM2)} m²</dd>
          <dt>Écart</dt>
          <dd style={{ color: surfaceOk ? "var(--status-success)" : "var(--bad)" }}>
            {surfaceEcart >= 0 ? "+" : ""}
            {fmt(surfaceEcart)} m²
          </dd>
          <dt>Périmètre calculé</dt>
          <dd>{fmt(perimeterM)} m</dd>
        </dl>
      </section>

      <section className="gt-section">
        <h4>Contrôle des distances</h4>
        {distanceChecks.length === 0 ? (
          <p className="gt-ocr-sub" style={{ margin: 0 }}>
            Aucun contrôle de distance enregistré.
          </p>
        ) : (
          <table className="gt-ocr-table">
            <thead>
              <tr>
                <th>Segment</th>
                <th className="num">Croquis (m)</th>
                <th className="num">Calculé (m)</th>
                <th className="num">Écart (m)</th>
                <th className="num">Statut</th>
              </tr>
            </thead>
            <tbody>
              {distanceChecks.map((dc) => {
                const ok = isDistanceConforme(dc.ecartM);
                return (
                  <tr key={dc.id || dc.segmentLabel}>
                    <td>{dc.segmentLabel}</td>
                    <td className="num">{fmt(dc.croquisM, 3)}</td>
                    <td className="num">{fmt(dc.calculeM, 3)}</td>
                    <td className="num" style={{ color: ok ? "var(--status-success)" : "var(--bad)" }}>
                      {dc.ecartM >= 0 ? "+" : ""}
                      {fmt(dc.ecartM, 3)}
                    </td>
                    <td className="num">
                      <ConformiteBadge conforme={ok} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
