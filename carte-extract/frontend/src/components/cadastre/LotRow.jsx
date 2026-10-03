import React from "react";

const STATUT = { valide: ["success", "Validé"], verifie: ["info", "Vérifié"], brouillon: ["neutral", "Brouillon"] };

// One lot as a row — the same everywhere a lot is listed under a projet or a prestation:
// name + titre, its operation tags, the surface, and its review / conformity status.
export default function LotRow({ lot, onOpen }) {
  const [tone, label] = STATUT[lot.statut] || STATUT.brouillon;
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag type={onOpen ? "button" : undefined} className={`pd-lot${onOpen ? " is-link" : ""}`} onClick={onOpen ? () => onOpen(lot.id) : undefined}>
      <span className="pd-lot-main">
        <span className="pd-lot-name">{lot.proprieteDite}</span>
        <span className="gt-mono pd-lot-ref">Titre {lot.titreFoncier}{lot.createdByName ? ` · ${lot.createdByName}` : ""}</span>
        {lot.operation && <span className="cad-ops-tags">{lot.operation.split(",").map((op) => <em key={op} className="cad-op-tag">{op}</em>)}</span>}
      </span>
      <span className="pd-lot-right">
        <strong>{Number(lot.surfaceCalculeeM2).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²</strong>
        <span className={`gt-status-pill ${tone}`}><span className="gt-status-pill-dot" />{label}</span>
        <span className={`gt-status-pill ${lot.conforme ? "success" : "danger"}`}><span className="gt-status-pill-dot" />{lot.conforme ? "Conforme" : "Écart"}</span>
      </span>
    </Tag>
  );
}
