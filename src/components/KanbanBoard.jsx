import React from "react";
import { STAGES, STAGE_COLORS, STATUS_LABELS, STATUS_PILL_KIND } from "../constants";
import { projetStatus } from "../utils/stats";
import { rejectionReason } from "../utils/notifications";

// A project with no prestations yet (or none still active) has no STAGES key to land in, so it
// gets its own leading column instead of silently vanishing from the board.
const NO_STAGE_COLUMN = { key: null, label: "Sans prestation" };

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
    <div>
      <div className="gt-segbar">
        {livre > 0 && <div className="gt-segbar-seg success" style={{ width: `${(livre / total) * 100}%` }} />}
        {nonConf > 0 && <div className="gt-segbar-seg danger" style={{ width: `${(nonConf / total) * 100}%` }} />}
        {enCours > 0 && <div className="gt-segbar-seg info" style={{ width: `${(enCours / total) * 100}%` }} />}
      </div>
      <div className="gt-segbar-caption">{livre}/{total} prestation{total > 1 ? "s" : ""} livrée{total > 1 ? "s" : ""}</div>
    </div>
  );
}

export default function KanbanBoard({ projects, getClient, onOpenProjet, getProjetStage }) {
  const columns = [NO_STAGE_COLUMN, ...STAGES];
  return (
    <div className="gt-kanban">
      {columns.map((stage) => {
        const colProjects = projects.filter((pr) => getProjetStage(pr) === stage.key);
        return (
          <div className="gt-kanban-col" key={stage.key ?? "sans-prestation"}>
            <div className="gt-kanban-col-head" style={{ borderBottomColor: stage.key ? STAGE_COLORS[stage.key] : "var(--status-neutral)" }}>
              {stage.label}
              <span className="gt-kanban-col-count">{colProjects.length}</span>
            </div>
            <div className="gt-kanban-col-body">
              {colProjects.map((pr) => {
                const client = getClient(pr.clientId);
                const status = projetStatus(pr);
                const nonConfCount = pr.prestations.filter((p) => rejectionReason(p)).length;
                return (
                  <div className="gt-kanban-card gt-card gt-card-hover" key={pr.id} onClick={() => onOpenProjet(pr.id)}>
                    <div className="gt-kanban-card-top">
                      <span className="gt-kanban-card-id gt-mono">{pr.id}</span>
                      <span className={`gt-status-pill ${STATUS_PILL_KIND[status]}`}>
                        <span className="gt-status-pill-dot" />{STATUS_LABELS[status]}
                      </span>
                    </div>
                    <div className="gt-kanban-card-client">{client?.nom || "—"}</div>
                    {pr.planCote && <div className="gt-kanban-card-meta gt-mono">{pr.planCote}</div>}
                    <div className="gt-kanban-card-meta">{pr.referenceFonciere}</div>
                    <div className="gt-kanban-card-bottom">
                      <span className="gt-kanban-card-meta">
                        {pr.prestations.length} prestation{pr.prestations.length > 1 ? "s" : ""}
                      </span>
                      {nonConfCount > 0 && (
                        <span className="gt-status-pill danger">
                          <span className="gt-status-pill-dot" />{nonConfCount} non-conforme{nonConfCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {pr.prestations.length > 1 && <ProjectProgress prestations={pr.prestations} />}
                  </div>
                );
              })}
              {colProjects.length === 0 && <div className="gt-kanban-empty">Aucun projet.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
