import React, { useMemo, useState } from "react";
import { AlertTriangle, MapPin, Radio, UserRound, Gauge } from "lucide-react";
import { computeResourceStats } from "../utils/stats";
import { isPastDue, parseDateFR } from "../utils/dates";
import { RESOURCE_STATUSES, RESOURCE_TYPES } from "../constants";
import ResourceTypeIcon from "./ResourceTypeIcon";
import { vehiculePapers, vehiculeAlerts } from "../utils/vehicule";

const DAY_MS = 86400000;
const SOON_DAYS = 60;

// Where an instrument stands between its last calibration and the next one due.
function calibrationOf(item) {
  const next = parseDateFR(item.prochaineCalibration);
  if (next == null) return null;
  const last = parseDateFR(item.derniereCalibration);
  const now = Date.now();
  const days = Math.ceil((next - now) / DAY_MS);
  const span = last != null && next > last ? next - last : null;
  const elapsed = span ? Math.min(1, Math.max(0, (now - last) / span)) : days < 0 ? 1 : 0.5;
  const level = days < 0 ? "late" : days <= SOON_DAYS ? "soon" : "ok";
  const text = days < 0 ? `en retard de ${-days} j` : days === 0 ? "aujourd'hui" : `dans ${days} j`;
  return { days, elapsed, level, text, due: item.prochaineCalibration };
}

export default function ResourceListView({ items, projects, matches, query, onOpenItem, emptyLabel }) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState("encours");

  const types = useMemo(
    () => [...new Set(items.map((it) => it.type).filter(Boolean))],
    [items]
  );
  const isFleet = useMemo(() => items.length > 0 && items.every((it) => it.type === "vehicule"), [items]);
  const hasWatch = useMemo(() => items.some((it) => it.prochaineCalibration || it.type === "vehicule"), [items]);

  const rows = useMemo(() => {
    const filtered = items
      .map((it) => ({
        item: it,
        stats: computeResourceStats(it, projects, matches),
        cal: it.type === "vehicule" ? null : calibrationOf(it),
        papers: it.type === "vehicule" ? vehiculePapers(it) : null,
        alerts: vehiculeAlerts(it),
        statusInfo: RESOURCE_STATUSES.find((st) => st.key === (it.status || "operationnel")),
      }))
      .filter(
        ({ item }) => !query || item.nom.toLowerCase().includes(query.toLowerCase()) || item.id.toLowerCase().includes(query.toLowerCase())
      )
      .filter(({ item }) => filterStatus === "all" || (item.status || "operationnel") === filterStatus)
      .filter(({ item }) => filterType === "all" || item.type === filterType)
      .filter(({ item, alerts }) => !overdueOnly || (item.type === "vehicule" ? alerts.length > 0 : isPastDue(item.prochaineCalibration)));
    const sorted = [...filtered];
    if (sortKey === "encours") sorted.sort((a, b) => b.stats.enCours - a.stats.enCours || b.stats.nbUsageTotal - a.stats.nbUsageTotal || a.item.nom.localeCompare(b.item.nom));
    else if (sortKey === "nom") sorted.sort((a, b) => a.item.nom.localeCompare(b.item.nom));
    else if (sortKey === "utilisations") sorted.sort((a, b) => b.stats.nbUsageTotal - a.stats.nbUsageTotal || a.item.nom.localeCompare(b.item.nom));
    return sorted;
  }, [items, projects, matches, query, filterStatus, filterType, overdueOnly, sortKey]);

  const summary = useMemo(() => {
    const cals = items.map((it) => {
      if (it.type !== "vehicule") return calibrationOf(it);
      const a = vehiculeAlerts(it);
      if (a.some((x) => x.level === "late")) return { level: "late" };
      return a.length ? { level: "soon" } : { level: "ok" };
    });
    const count = (key) => items.filter((it) => (it.status || "operationnel") === key).length;
    return {
      total: items.length,
      ok: count("operationnel"),
      down: items.length - count("operationnel"),
      late: cals.filter((c) => c && c.level === "late").length,
      soon: cals.filter((c) => c && c.level === "soon").length,
      tracked: cals.filter(Boolean).length,
    };
  }, [items]);

  const hasActiveFilters = filterStatus !== "all" || filterType !== "all" || overdueOnly;

  return (
    <>
      <div className="rg-ledger" role="group" aria-label="Synthèse">
        <div className="rg-ledger-cell"><span>Parc</span><strong>{summary.total}</strong></div>
        <button type="button" className={`rg-ledger-cell is-ok ${filterStatus === "operationnel" ? "is-on" : ""}`} onClick={() => setFilterStatus(filterStatus === "operationnel" ? "all" : "operationnel")}>
          <span>Opérationnels</span><strong>{summary.ok}</strong>
        </button>
        <div className={`rg-ledger-cell ${summary.down ? "is-warn" : ""}`}><span>À l'arrêt</span><strong>{summary.down}</strong></div>
        {summary.tracked > 0 && (
          <button type="button" className={`rg-ledger-cell ${summary.late ? "is-bad" : ""} ${overdueOnly ? "is-on" : ""}`} onClick={() => setOverdueOnly((v) => !v)}>
            <span>{isFleet ? "Papiers expirés" : "Étalonnage en retard"}</span>
            <strong>{summary.late}</strong>
            {summary.soon > 0 && <em>+ {summary.soon} {isFleet ? "à renouveler" : `sous ${SOON_DAYS} j`}</em>}
          </button>
        )}
      </div>

      <div className="rg-filters">
        <div className="rg-seg" role="group" aria-label="Statut">
          {[{ key: "all", label: "Tous", n: items.length }, ...RESOURCE_STATUSES.map((st) => ({ key: st.key, label: st.label, n: items.filter((it) => (it.status || "operationnel") === st.key).length }))].map((o) => (
            <button key={o.key} type="button" className={filterStatus === o.key ? "is-on" : ""} onClick={() => setFilterStatus(o.key)}>
              {o.label}<i>{o.n}</i>
            </button>
          ))}
        </div>

        {types.length > 1 && (
          <div className="rg-chips" role="group" aria-label="Type">
            {types.map((t) => (
              <button key={t} type="button" className={filterType === t ? "is-on" : ""} onClick={() => setFilterType(filterType === t ? "all" : t)}>
                <ResourceTypeIcon type={t} size={13} />
                {RESOURCE_TYPES.find((rt) => rt.key === t)?.label || t}
              </button>
            ))}
          </div>
        )}

        <div className="rg-filters-end">
          {hasWatch && (
            <button type="button" className={`rg-chip-toggle ${overdueOnly ? "is-on" : ""}`} onClick={() => setOverdueOnly((v) => !v)}>
              <AlertTriangle size={13} /> {isFleet ? "Papiers à renouveler" : "Étalonnage en retard"}
            </button>
          )}
          <label className="rg-sort">
            <span>Trier</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="encours">En mission d'abord</option>
              <option value="nom">Nom (A→Z)</option>
              <option value="utilisations">Plus utilisés</option>
            </select>
          </label>
          {hasActiveFilters && (
            <button type="button" className="rg-reset" onClick={() => { setFilterStatus("all"); setFilterType("all"); setOverdueOnly(false); }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="rg-grid">
        {rows.map(({ item, stats, cal, papers, statusInfo }, i) => (
          <button
            type="button"
            key={item.id}
            className={`rg-card is-${statusInfo?.key || "operationnel"}`}
            style={{ "--i": i }}
            onClick={() => onOpenItem(item.id)}
          >
            <span className="rg-plate" aria-hidden="true">
              <ResourceTypeIcon type={item.type} size={26} strokeWidth={1.6} />
            </span>
            <span className="rg-head">
              <span className="rg-idrow">
                <span className="rg-id">{item.id}</span>
                {statusInfo && (
                  <span className={`gt-status-pill ${statusInfo.pill}`}>
                    <span className="gt-status-pill-dot" />{statusInfo.label}
                  </span>
                )}
              </span>
              <span className="rg-name">{item.nom}</span>
              <span className="rg-model">
                {item.marque || item.modele ? `${item.marque || ""} ${item.modele || ""}`.trim() : RESOURCE_TYPES.find((t) => t.key === item.type)?.label || "—"}
              </span>
            </span>
            {cal ? (
              <span className={`rg-cal is-${cal.level}`}>
                <span className="rg-cal-top">
                  <span>Étalonnage</span>
                  <b>{cal.level === "late" && <AlertTriangle size={11} />} {cal.text}</b>
                </span>
                <span className="rg-cal-track"><i style={{ width: `${Math.round(cal.elapsed * 100)}%` }} /></span>
                <span className="rg-cal-due">Échéance {cal.due}</span>
              </span>
            ) : papers ? (
              <span className="rg-papers">
                {papers.map((p) => (
                  <span key={p.key} className={`rg-paper is-${p.level}`} title={p.due ? `${p.label} — échéance ${p.due}` : `${p.label} non renseigné`}>
                    <i />
                    <span className="rg-paper-label">{p.label}</span>
                    <b>{p.level === "none" ? "—" : p.text}</b>
                  </span>
                ))}
                <span className="rg-fleetmeta">
                  <span><Gauge size={12} /> {item.kilometrage !== "" ? `${Number(item.kilometrage).toLocaleString("fr-FR")} km` : "km —"}</span>
                  <span><UserRound size={12} /> {item.conducteur || "Sans conducteur"}</span>
                </span>
              </span>
            ) : (
              <span className="rg-cal rg-cal-none">
                <span className="rg-cal-top"><span>Étalonnage</span><b>non suivi</b></span>
              </span>
            )}

            <span className="rg-foot">
              <span className="rg-loc" title={item.emplacement || ""}>
                <MapPin size={12} /> {item.emplacement || "Emplacement non renseigné"}
              </span>
              <span className="rg-usage">
                {stats.enCours > 0 && (
                  <span className="rg-live"><Radio size={12} /> {stats.enCours} en mission</span>
                )}
                <span><b>{stats.nbUsageTotal}</b> utilisation{stats.nbUsageTotal > 1 ? "s" : ""}</span>
              </span>
            </span>
          </button>
        ))}
        {rows.length === 0 && <div className="gt-list-empty rg-empty">{emptyLabel}</div>}
      </div>
    </>
  );
}
