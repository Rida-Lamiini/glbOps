// Small pieces of markup shared by the Carte's popup (plain DOM — MapLibre popups are not React) and its
// side panel / ribbon (which inject the same strings), so a prestation looks identical everywhere:
// a nature "stamp" (monogram + glyph in the nature's ink) and a 7-notch stage gauge.
import { STAGES, STAGE_COLORS } from "../constants";
import { NATURES, prestationKind } from "./nature";

export const LOT_COLORS = { valide: "#1f7a55", verifie: "#2f6690", brouillon: "#b7791f" };
export const LOT_STATUT_LABEL = { valide: "Validé", verifie: "Vérifié", brouillon: "Brouillon" };

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const GLYPH = {
  plan: '<path d="M3 12h18M3 7v10M21 7v10M7 9l-4 3 4 3M17 9l4 3-4 3"/>',
  mec: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  copro: '<rect x="4" y="4" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="10" height="10" rx="1.5"/>',
  mt: '<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>',
  bornage: '<path d="M12 3l9 9-9 9-9-9z"/>',
  lidar: '<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M7 17a7 7 0 0 1 0-10M17 17a7 7 0 0 0 0-10"/>',
  autre: '<circle cx="12" cy="12" r="4"/>',
};

export const natureGlyph = (kind, size = 12) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[kind] || GLYPH.autre}</svg>`;

export const stampHTML = (kind, { long = false } = {}) => {
  const n = NATURES[kind] || NATURES.autre;
  return `<span class="mp-stamp" style="--nc:${n.color}" title="${esc(n.label)}">${natureGlyph(kind)}<b>${esc(long ? n.label : n.short)}</b></span>`;
};

// Where a prestation stands: { index, label, color, done }
export function stageMeta(prestation) {
  const index = Math.max(0, STAGES.findIndex((s) => s.key === prestation.stage));
  const done = prestation.stage === "livraison" && Boolean(prestation.chemin);
  return { index, done, label: done ? "Livré" : STAGES[index].label, color: done ? "var(--good)" : STAGE_COLORS[prestation.stage] || "var(--muted)" };
}

export const gaugeHTML = (prestation) => {
  const m = stageMeta(prestation);
  const notches = STAGES.map((s, i) => `<i class="${i < m.index || m.done ? "on" : i === m.index ? "on cur" : ""}"></i>`).join("");
  return `<span class="mp-gauge" style="--c:${m.color}" role="img" aria-label="Étape ${m.index + 1} sur ${STAGES.length} : ${esc(m.label)}">${notches}</span>`;
};

// One prestation as a row: stamp · stage label + gauge · start date (and a flag when it came back non-conforme).
export const prestationRowHTML = (p) => {
  const m = stageMeta(p);
  return `<li class="mp-pr" title="${esc(p.id)}">
    ${stampHTML(prestationKind(p))}
    <span class="mp-pr-body"><span class="mp-pr-stage" style="color:${m.color}">${esc(m.label)}</span>${gaugeHTML(p)}</span>
    ${p.cycles > 0 ? `<em class="mp-nc" title="Retours en non-conformité">NC ×${p.cycles}</em>` : ""}
    <span class="mp-pr-date">${esc(p.dateDebutDemande || "")}</span>
  </li>`;
};
