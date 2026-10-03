import React from "react";
import { STATUS_COLORS, STATUS_LABELS } from "../../constants";
import { NATURES, NATURE_ORDER } from "../../utils/nature";
import { stampHTML } from "../../utils/mapCards";

// The strip above the map: how much there is (dossiers · prestations · lots) and the two filters —
// by kind of prestation (stamps) and by status (dots). Counts are prestations, so a dossier
// "MEC et COPRO" counts once in each.
export default function MapRibbon({ dossiers, onMap, prestations, lots, natureCounts, activeNatures, onToggleNature, statusCounts, activeStatuses, onToggleStatus }) {
  const kinds = NATURE_ORDER.filter((k) => natureCounts[k] > 0 || !activeNatures.has(k));
  return (
    <div className="mp-ribbon">
      <div className="mp-ribbon-figures" role="list">
        <div role="listitem"><b>{onMap}</b><span>dossier{onMap > 1 ? "s" : ""} sur la carte{dossiers > onMap ? ` / ${dossiers}` : ""}</span></div>
        <div role="listitem"><b>{prestations}</b><span>prestation{prestations > 1 ? "s" : ""}</span></div>
        <div role="listitem"><b>{lots}</b><span>lot{lots > 1 ? "s" : ""}</span></div>
      </div>

      <div className="mp-chipset" role="group" aria-label="Filtrer par prestation">
        {kinds.map((k) => (
          <button key={k} type="button" className={`mp-chip${activeNatures.has(k) ? " is-on" : ""}`} style={{ "--nc": NATURES[k].color }} onClick={() => onToggleNature(k)} aria-pressed={activeNatures.has(k)}>
            <span dangerouslySetInnerHTML={{ __html: stampHTML(k) }} />
            <em>{natureCounts[k]}</em>
          </button>
        ))}
      </div>

      <div className="mp-chipset is-status" role="group" aria-label="Filtrer par statut">
        {Object.keys(STATUS_LABELS).map((k) => (
          <button key={k} type="button" className={`mp-chip is-status${activeStatuses.has(k) ? " is-on" : ""}`} onClick={() => onToggleStatus(k)} aria-pressed={activeStatuses.has(k)}>
            <i style={{ background: STATUS_COLORS[k] }} />
            <span>{STATUS_LABELS[k]}</span>
            <em>{statusCounts[k]}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
