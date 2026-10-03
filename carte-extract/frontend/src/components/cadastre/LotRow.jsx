import React from "react";
import { LOT_COLORS } from "../../utils/mapCards";

const STATUT = { valide: ["success", "Validé"], verifie: ["info", "Vérifié"], brouillon: ["neutral", "Brouillon"] };

// One lot as a row — the same everywhere a lot is listed (under a projet, under a prestation, in the Carte's panel):
// name + titre, its operation tags, the surface, and its review / conformity status; the edge takes the review colour.
// `lot` is { id, proprieteDite, titreFoncier, operation, surfaceCalculeeM2, statut, conforme, createdByName? };
// `meta` replaces the small "Titre … · author" line when a list wants to show something else (e.g. the projet).
export default function LotRow({ lot, onOpen, meta }) {
  const [tone, label] = STATUT[lot.statut] || STATUT.brouillon;
  const Tag = onOpen ? "button" : "div";
  const surface = Number(lot.surfaceCalculeeM2);
  return (
    <Tag
      type={onOpen ? "button" : undefined}
      className={`pd-lot${onOpen ? " is-link" : ""}`}
      style={{ "--lot-color": LOT_COLORS[lot.statut] || LOT_COLORS.brouillon }}
      onClick={onOpen ? () => onOpen(lot.id) : undefined}
    >
      <span className="pd-lot-main">
        <span className="pd-lot-name">{lot.proprieteDite}</span>
        <span className="gt-mono pd-lot-ref">{meta ?? `Titre ${lot.titreFoncier}${lot.createdByName ? ` · ${lot.createdByName}` : ""}`}</span>
        {lot.operation && <span className="cad-ops-tags">{lot.operation.split(",").map((op) => <em key={op} className="cad-op-tag">{op}</em>)}</span>}
      </span>
      <span className="pd-lot-right">
        {Number.isFinite(surface) && lot.surfaceCalculeeM2 != null && <strong>{surface.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²</strong>}
        <span className={`gt-status-pill ${tone}`}><span className="gt-status-pill-dot" />{label}</span>
        <span className={`gt-status-pill ${lot.conforme ? "success" : "danger"}`}><span className="gt-status-pill-dot" />{lot.conforme ? "Conforme" : "Écart"}</span>
      </span>
    </Tag>
  );
}
