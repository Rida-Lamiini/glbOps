import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, FolderOpen } from "lucide-react";
import { apiGet } from "../lib/api";
import { adaptResource } from "../lib/apiAdapters";
import { RESOURCE_STATUSES, RESOURCE_TYPES } from "../constants";
import { vehiculeAlerts } from "../utils/vehicule";
import ResourceTypeIcon from "./ResourceTypeIcon";
import ResourceMovements from "./ResourceMovements";

/**
 * Landing page of a QR label: a phone-sized card for one resource, with the check-out / check-in
 * form. Works for every role (a field agent only needs this), the office can also jump to the full sheet.
 */
export default function ResourceScan({ id, authUser, onClose, onOpenFiche }) {
  const [resource, setResource] = useState(null);
  const [error, setError] = useState("");
  const isOffice = authUser.role === "Dispatcher" || authUser.role === "Directrice";

  useEffect(() => {
    let cancelled = false;
    apiGet(`/resources/${encodeURIComponent(id)}/`)
      .then((r) => !cancelled && setResource(adaptResource(r)))
      .catch(() => !cancelled && setError("Ressource introuvable. Vérifiez l'étiquette ou contactez le bureau."));
    return () => { cancelled = true; };
  }, [id]);

  const statusInfo = resource && RESOURCE_STATUSES.find((s) => s.key === (resource.status || "operationnel"));
  const typeLabel = resource && RESOURCE_TYPES.find((t) => t.key === resource.type)?.label;
  const alerts = resource ? vehiculeAlerts(resource) : [];

  return (
    <div className="scan">
      <header className="scan-brand">
        <span className="gt-sidebar-brand-plate"><img src="/logo.png" alt="Globetudes" className="gt-sidebar-brand-mark" /></span>
        <span className="gt-sidebar-wordmark"><strong>Globetudes</strong><em>Étiquette QR</em></span>
      </header>

      {error && (
        <div className="scan-card">
          <div className="scan-error"><AlertTriangle size={18} /> {error}</div>
        </div>
      )}

      {!error && !resource && <div className="scan-card"><div className="gt-list-empty">Chargement…</div></div>}

      {resource && (
        <div className="scan-card">
          <div className="scan-head">
            <span className="rg-plate" aria-hidden="true"><ResourceTypeIcon type={resource.type} size={26} strokeWidth={1.6} /></span>
            <div className="scan-title">
              <span className="rg-id">{resource.id}</span>
              <h1>{resource.nom}</h1>
              <span className="rg-model">{[resource.marque, resource.modele].filter(Boolean).join(" ") || typeLabel}</span>
            </div>
          </div>

          <div className="scan-badges">
            {statusInfo && <span className={`gt-status-pill ${statusInfo.pill}`}><span className="gt-status-pill-dot" />{statusInfo.label}</span>}
            {alerts.map((a) => (
              <span key={a.key} className={`gt-status-pill ${a.level === "late" ? "danger" : "warning"}`}>
                <AlertTriangle size={11} /> {a.label} {a.level === "late" ? "expirée" : "à renouveler"}
              </span>
            ))}
          </div>

          <ResourceMovements resource={resource} onChange={(patch) => setResource((r) => ({ ...r, ...patch }))} />
        </div>
      )}

      <footer className="scan-actions">
        {isOffice && resource && (
          <button type="button" className="scan-link" onClick={() => onOpenFiche(resource.id)}>
            <FolderOpen size={16} /> Ouvrir la fiche complète
          </button>
        )}
        <button type="button" className="scan-link is-plain" onClick={onClose}>
          Aller à l'application <ArrowRight size={15} />
        </button>
      </footer>
    </div>
  );
}
