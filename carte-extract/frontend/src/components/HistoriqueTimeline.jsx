import React from "react";
import { Clock, CheckCircle2, PauseCircle, AlertTriangle, XCircle, Archive, Users, FolderOpen, FileText } from "lucide-react";

// Classifies a history label into an icon + the shared semantic status color (tokens.css) so
// entries are scannable at a glance without rereading the full sentence, and so the timeline
// uses the exact same conforme/en-cours/non-conforme/en-attente palette as every other view.
const EVENT_TYPES = [
  { match: /^Demande reçue/, icon: FileText, kind: "neutral" },
  { match: /^Prestation définie/, icon: FileText, kind: "info" },
  { match: /^Affectation/, icon: Users, kind: "info" },
  { match: /^(Passage à l'exécution|Exécution saisie|Nouvelle exécution)/, icon: CheckCircle2, kind: "info" },
  { match: /^Visite partielle/, icon: PauseCircle, kind: "warning" },
  { match: /^Données insuffisantes/, icon: AlertTriangle, kind: "danger" },
  { match: /^Tâche (terminée|réouverte)/, icon: CheckCircle2, kind: "success" },
  { match: /^Tâches affectées/, icon: Users, kind: "info" },
  { match: /^Traitement bureau terminé/, icon: CheckCircle2, kind: "success" },
  { match: /^Non conforme/, icon: XCircle, kind: "danger" },
  { match: /^Contrôle conforme/, icon: CheckCircle2, kind: "success" },
  { match: /^Livré/, icon: Archive, kind: "success" },
  { match: /^(Chemin ajouté|.*pièce.*jointe)/i, icon: FolderOpen, kind: "neutral" },
];
const DEFAULT_EVENT = { icon: Clock, kind: "neutral" };

const classify = (label) => EVENT_TYPES.find((e) => e.match.test(label)) || DEFAULT_EVENT;

// Consecutive entries with the identical label + author collapse into one row with a ×N
// badge, so a real bug (or a legitimate repeat) reads as one grouped event instead of a wall
// of identical lines.
function groupConsecutive(history) {
  const grouped = [];
  (history || []).forEach((h) => {
    const last = grouped[grouped.length - 1];
    if (last && last.label === h.label && last.author === h.author && last.tag === h.tag) {
      last.count += 1;
      last.lastDate = h.date;
    } else {
      grouped.push({ ...h, count: 1, lastDate: h.date });
    }
  });
  return grouped;
}

// onOpenTag is optional — when passed (dashboard-level aggregated feeds spanning several
// prestations), rows become clickable and jump to the prestation named by their `tag`. Drawer
// timelines (a single prestation/projet's own history) never pass it, so they stay inert.
export default function HistoriqueTimeline({ history, limit, emptyLabel = "Aucun événement pour l'instant.", onOpenTag }) {
  const grouped = groupConsecutive(history).reverse();
  const shown = limit ? grouped.slice(0, limit) : grouped;

  return (
    <div className="gt-timeline">
      {shown.map((h, i) => {
        const { icon: Icon, kind } = classify(h.label);
        const clickable = Boolean(onOpenTag && h.tag);
        return (
          <div
            className={`gt-timeline-row${clickable ? " clickable" : ""}`}
            key={i}
            onClick={clickable ? () => onOpenTag(h.tag) : undefined}
          >
            <div className={`gt-timeline-icon ${kind}`}>
              <Icon size={12} />
            </div>
            <div className="gt-timeline-body">
              <div className="gt-mono gt-timeline-date">
                {h.count > 1 ? `${h.date} → ${h.lastDate}` : h.date}
                {h.author && <span className="gt-timeline-author"> · {h.author}</span>}
                {h.count > 1 && <span className="gt-timeline-count">×{h.count}</span>}
                {h.tag && <span className="gt-timeline-tag">{h.tag}</span>}
              </div>
              <div className="gt-timeline-label">{h.label}</div>
            </div>
          </div>
        );
      })}
      {shown.length === 0 && <div className="gt-list-empty">{emptyLabel}</div>}
    </div>
  );
}
