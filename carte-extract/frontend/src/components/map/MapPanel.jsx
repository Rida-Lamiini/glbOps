import React, { useMemo, useState } from "react";
import { Crosshair, Search, X } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS } from "../../constants";
import { projetStatus } from "../../utils/stats";
import { NATURES, NATURE_ORDER, prestationKind } from "../../utils/nature";
import { LOT_COLORS, LOT_STATUT_LABEL, gaugeHTML, stageMeta, stampHTML } from "../../utils/mapCards";
import LotRow from "../cadastre/LotRow";

const Html = ({ html, as: Tag = "span" }) => <Tag dangerouslySetInnerHTML={{ __html: html }} />;
const has = (text, q) => String(text || "").toLowerCase().includes(q);

// The panel on the right of the Carte, in three views of the same data:
//   Projets — one card per projet with all its prestations and its lots
//   Prestations — every prestation, grouped by kind
//   Lots — the cadastral lots
export default function MapPanel({ projets, lots, getClient, activeId, tab, onTab, onFocusProject, onFocusLot, onClose }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const lotsByProjet = useMemo(() => {
    const map = {};
    lots.forEach((l) => { if (l.projetId) (map[l.projetId] ||= []).push(l); });
    return map;
  }, [lots]);

  const dossiers = useMemo(
    () => projets.filter((pr) => !q || has(getClient(pr.clientId)?.nom, q) || has(pr.id, q) || has(pr.situation, q) || has(pr.referenceFonciere, q) || pr.prestations.some((p) => has(p.natureDemandee, q))),
    [projets, q, getClient],
  );

  const prestationGroups = useMemo(() => {
    const groups = {};
    projets.forEach((pr) => {
      pr.prestations.forEach((p) => {
        const client = getClient(pr.clientId)?.nom || "—";
        if (q && !(has(client, q) || has(pr.id, q) || has(p.natureDemandee, q) || has(p.id, q))) return;
        (groups[prestationKind(p)] ||= []).push({ p, pr, client });
      });
    });
    return NATURE_ORDER.filter((k) => groups[k]).map((k) => ({ kind: k, rows: groups[k].sort((a, b) => stageMeta(b.p).index - stageMeta(a.p).index) }));
  }, [projets, q, getClient]);
  const prestationTotal = prestationGroups.reduce((n, g) => n + g.rows.length, 0);

  const shownLots = useMemo(() => lots.filter((l) => !q || has(l.titre, q) || has(l.propriete, q) || has(l.operation, q) || has(l.projetId, q)), [lots, q]);

  return (
    <aside className="gt-map-panel mp-panel" aria-label="Projets, prestations et lots">
      <div className="mp-panel-head">
        <div className="mp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "projets"} className={tab === "projets" ? "is-on" : ""} onClick={() => onTab("projets")}>Projets <em>{dossiers.length}</em></button>
          <button type="button" role="tab" aria-selected={tab === "prestations"} className={tab === "prestations" ? "is-on" : ""} onClick={() => onTab("prestations")}>Prestations <em>{prestationTotal}</em></button>
          <button type="button" role="tab" aria-selected={tab === "lots"} className={tab === "lots" ? "is-on" : ""} onClick={() => onTab("lots")}>Lots <em>{shownLots.length}</em></button>
        </div>
        <button className="gt-iconbtn" onClick={onClose} aria-label="Fermer le panneau"><X size={15} /></button>
      </div>
      <label className="mp-panel-search">
        <Search size={13} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, projet, prestation, titre…" aria-label="Rechercher dans le panneau" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Effacer"><X size={12} /></button>}
      </label>

      <div className="mp-panel-list">
        {tab === "projets" && dossiers.map((pr) => {
          const st = projetStatus(pr);
          const pLots = lotsByProjet[pr.id] || [];
          return (
            <button key={pr.id} type="button" className={`mp-card${activeId === pr.id ? " is-active" : ""}`} onClick={() => onFocusProject(pr)}>
              <span className="mp-card-top">
                <span className="mp-card-client">{getClient(pr.clientId)?.nom || "—"}</span>
                <span className="mp-pill" style={{ "--pc": STATUS_COLORS[st] }}>{STATUS_LABELS[st]}</span>
              </span>
              <span className="mp-card-sub"><span className="gt-mono">{pr.id}</span>{pr.situation ? ` · ${pr.situation}` : ""}</span>
              {pr.prestations.length > 0 && (
                <ul className="mp-pr-list">
                  {pr.prestations.map((p) => {
                    const m = stageMeta(p);
                    return (
                      <li key={p.id} className="mp-pr">
                        <Html html={stampHTML(prestationKind(p))} />
                        <span className="mp-pr-body"><span className="mp-pr-stage" style={{ color: m.color }}>{m.label}</span><Html html={gaugeHTML(p)} /></span>
                        {p.cycles > 0 && <em className="mp-nc">NC ×{p.cycles}</em>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {pLots.length > 0 && (
                <span className="mp-card-lots">
                  {pLots.map((l) => (
                    <span key={l.id} className="mp-lotchip" style={{ "--lc": LOT_COLORS[l.statut] }} title={`${l.propriete} — ${LOT_STATUT_LABEL[l.statut]}${l.conforme ? "" : " · écart de surface"}`}>
                      <i /> Titre {l.titre}{l.conforme ? "" : " · écart"}
                    </span>
                  ))}
                </span>
              )}
              <Crosshair size={13} className="mp-card-go" aria-hidden="true" />
            </button>
          );
        })}
        {tab === "projets" && dossiers.length === 0 && <div className="gt-list-empty">Aucun projet avec ces filtres.</div>}

        {tab === "prestations" && prestationGroups.map((g) => (
          <section key={g.kind} className="mp-group">
            <h4 style={{ "--nc": NATURES[g.kind].color }}><Html html={stampHTML(g.kind, { long: true })} /><em>{g.rows.length}</em></h4>
            {g.rows.map(({ p, pr, client }) => {
              const m = stageMeta(p);
              return (
                <button key={p.id} type="button" className={`mp-row${activeId === pr.id ? " is-active" : ""}`} onClick={() => onFocusProject(pr)}>
                  <span className="mp-row-main">
                    <span className="mp-row-client">{client}</span>
                    <span className="mp-row-meta"><span className="gt-mono">{pr.id}</span>{pr.situation ? ` · ${pr.situation}` : ""}</span>
                  </span>
                  <span className="mp-row-stage"><span style={{ color: m.color }}>{m.label}</span><Html html={gaugeHTML(p)} /></span>
                </button>
              );
            })}
          </section>
        ))}
        {tab === "prestations" && prestationTotal === 0 && <div className="gt-list-empty">Aucune prestation avec ces filtres.</div>}

        {tab === "lots" && shownLots.map((l) => (
          <LotRow
            key={l.id}
            lot={{ id: l.id, proprieteDite: l.propriete, titreFoncier: l.titre, operation: l.operation, livre: l.livre, surfaceCalculeeM2: l.surfaceCalculee, statut: l.statut, conforme: l.conforme }}
            meta={`Titre ${l.titre}${l.projetId ? ` · ${l.projetId}` : ""}`}
            onOpen={() => onFocusLot(l)}
          />
        ))}
        {tab === "lots" && shownLots.length === 0 && <div className="gt-list-empty">Aucun lot.</div>}
      </div>
    </aside>
  );
}
