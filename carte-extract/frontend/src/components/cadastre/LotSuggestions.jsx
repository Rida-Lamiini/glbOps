import React, { useEffect, useState } from "react";
import { FileScan, MapPin, Link2, Check } from "lucide-react";
import { findLotMatches } from "./api";

const fmtArea = (m2) => `${m2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²`;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

// Earlier lots that could help a projet: same titre foncier first (exact match), then
// lots within `radius` m of the pin. Two uses:
//  - "select" (new-project form): each row is a checkbox, the parent reuses the ticked ones
//    once the projet exists;
//  - "action" (projet drawer): each row has a button that reuses the lot right away.
export default function LotSuggestions({ titre, lat, lng, radius = 200, projetId, mode = "select", selected = [], onToggle, onReuse, busyId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = (titre || "").trim();
    const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
    if (!t && !hasPoint) { setData(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      findLotMatches({ titre: t, lat, lng, radius, projet: projetId })
        .then((d) => !cancelled && setData(d))
        .catch(() => !cancelled && setData(null));
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [titre, lat, lng, radius, projetId]);

  if (!data || (data.sameTitre.length === 0 && data.nearby.length === 0)) return null;

  const row = (m, kind) => {
    const checked = selected.includes(m.id);
    return (
      <div className={`ls-row ${checked ? "is-selected" : ""}`} key={`${kind}-${m.id}`}>
        <div className="ls-body">
          <div className="ls-name">{m.proprieteDite}</div>
          <div className="ls-meta gt-mono">
            {m.titreFoncier} · {m.nbBornes} bornes · {fmtArea(m.surfaceM2)}
            {m.distanceM != null && ` · à ${Math.round(m.distanceM)} m`}
            {m.createdAt && ` · ${fmtDate(m.createdAt)}`}
            {m.projet && ` · ${m.projet}`}
          </div>
        </div>
        {mode === "select" ? (
          <button type="button" className={`ls-btn ${checked ? "is-on" : ""}`} onClick={() => onToggle(m.id)} aria-pressed={checked}>
            {checked ? <><Check size={13} /> Réutilisé</> : <><Link2 size={13} /> Réutiliser</>}
          </button>
        ) : (
          <button type="button" className="ls-btn" disabled={busyId === m.id} onClick={() => onReuse(m)}>
            <Link2 size={13} /> {m.projet ? "Dupliquer comme base" : "Rattacher"}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="ls">
      {data.sameTitre.length > 0 && (
        <>
          <div className="ls-head"><FileScan size={13} /> Un lot existe déjà pour ce titre foncier</div>
          {data.sameTitre.map((m) => row(m, "titre"))}
        </>
      )}
      {data.nearby.length > 0 && (
        <>
          <div className="ls-head"><MapPin size={13} /> {data.nearby.length} lot{data.nearby.length > 1 ? "s" : ""} voisin{data.nearby.length > 1 ? "s" : ""} connu{data.nearby.length > 1 ? "s" : ""} (moins de {radius} m)</div>
          {data.nearby.map((m) => row(m, "near"))}
        </>
      )}
    </div>
  );
}
