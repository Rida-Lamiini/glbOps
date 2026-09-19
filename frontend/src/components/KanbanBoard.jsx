import React, { useRef } from "react";
import { STAGES, STAGE_COLORS, STATUS_LABELS, STATUS_PILL_KIND } from "../constants";
import { projetStatus } from "../utils/stats";
import { rejectionReason } from "../utils/notifications";
import MiniPipeline from "./MiniPipeline";

const MAX_PRESTATIONS_SHOWN = 3;

const stageColor = (key) => STAGE_COLORS[key] || "var(--status-neutral)";

// Segmented completion bar: proportion of this project's prestations that are livrées (green),
// actively non-conformes (red), or still in progress (blue) — same semantic tokens as the
// status pill, just stacked instead of a single fill.
function ProjectProgress({ prestations }) {
  const total = prestations.length;
  if (total === 0) return null;
  const livre = prestations.filter((p) => p.stage === "livraison" && p.chemin).length;
  const nonConf = prestations.filter((p) => rejectionReason(p)).length;
  const enCours = Math.max(0, total - livre - nonConf);
  return (
    <span className="gt-kanban-progress">
      <span className="gt-segbar">
        {livre > 0 && <span className="gt-segbar-seg success" style={{ width: `${(livre / total) * 100}%` }} />}
        {nonConf > 0 && <span className="gt-segbar-seg danger" style={{ width: `${(nonConf / total) * 100}%` }} />}
        {enCours > 0 && <span className="gt-segbar-seg info" style={{ width: `${(enCours / total) * 100}%` }} />}
      </span>
      <span className="gt-segbar-caption">{livre}/{total} prestation{total > 1 ? "s" : ""} livrée{total > 1 ? "s" : ""}</span>
    </span>
  );
}

export default function KanbanBoard({ projects, getClient, onOpenProjet, getProjetStage }) {
  const colRefs = useRef({});
  const grouped = STAGES.map((stage) => ({
    stage,
    items: projects.filter((pr) => getProjetStage(pr) === stage.key),
  }));
  const total = projects.length || 1;

  const jumpTo = (key) =>
    colRefs.current[key]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });

  return (
    <div className="gt-kb">
      <nav className="gt-kb-flow" aria-label="Pipeline des projets">
        {grouped.map(({ stage, items }, i) => (
          <button
            key={stage.key}
            type="button"
            className={`gt-kb-step ${items.length ? "has-items" : ""}`}
            style={{ "--stage": stageColor(stage.key) }}
            onClick={() => jumpTo(stage.key)}
            title={`${stage.label} — ${items.length} projet${items.length > 1 ? "s" : ""}`}
          >
            <span className="gt-kb-step-num">{i + 1}</span>
            <span className="gt-kb-step-label">{stage.label}</span>
            <span className="gt-kb-step-count">{items.length}</span>
            <span className="gt-kb-step-bar"><i style={{ width: `${(items.length / total) * 100}%` }} /></span>
          </button>
        ))}
      </nav>

      <div className="gt-kanban" role="list">
        {grouped.map(({ stage, items }) => (
          <section
            className="gt-kanban-col"
            key={stage.key}
            role="listitem"
            ref={(el) => { colRefs.current[stage.key] = el; }}
            style={{ "--stage": stageColor(stage.key) }}
          >
            <header className="gt-kanban-col-head">
              <span>{stage.label}</span>
              <span className="gt-kanban-col-count">{items.length}</span>
            </header>
            <div className="gt-kanban-col-body">
              {items.map((pr) => {
                const client = getClient(pr.clientId);
                const status = projetStatus(pr);
                const nonConfCount = pr.prestations.filter((p) => rejectionReason(p)).length;
                const shown = pr.prestations.slice(0, MAX_PRESTATIONS_SHOWN);
                const hidden = pr.prestations.length - shown.length;
                return (
                  <button type="button" className={`gt-kanban-card status-${status}`} key={pr.id} onClick={() => onOpenProjet(pr.id)}>
                    <span className="gt-kanban-card-top">
                      <span className="gt-kanban-card-id gt-mono">{pr.id}</span>
                      <span className={`gt-status-pill ${STATUS_PILL_KIND[status]}`}>
                        <span className="gt-status-pill-dot" />{STATUS_LABELS[status]}
                      </span>
                    </span>
                    <span className="gt-kanban-card-client">{client?.nom || "—"}</span>
                    <span className="gt-kanban-card-meta gt-mono">{pr.referenceFonciere}</span>
                    {shown.length > 0 && (
                      <span className="gt-kanban-card-prests">
                        {shown.map((p) => (
                          <span className="gt-kanban-card-prest" key={p.id}>
                            <span className="gt-kanban-card-prest-label">{p.natureDemandee || "Non définie"}</span>
                            <MiniPipeline stage={p.stage} />
                          </span>
                        ))}
                        {hidden > 0 && <span className="gt-kanban-card-meta">+ {hidden} autre{hidden > 1 ? "s" : ""}</span>}
                      </span>
                    )}
                    {nonConfCount > 0 && (
                      <span className="gt-status-pill danger">
                        <span className="gt-status-pill-dot" />{nonConfCount} non-conforme{nonConfCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {pr.prestations.length > 1 && <ProjectProgress prestations={pr.prestations} />}
                  </button>
                );
              })}
              {items.length === 0 && <div className="gt-kanban-empty">Aucun projet à cette étape</div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
