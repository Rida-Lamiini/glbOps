import React, { useMemo, useState } from "react";
import ResponsiveTableCard from "./ResponsiveTableCard";
import { AlertTriangle } from "lucide-react";
import { computeResourceStats } from "../utils/stats";
import { isPastDue } from "../utils/dates";
import { RESOURCE_STATUSES, RESOURCE_TYPES } from "../constants";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import ResourceTypeIcon from "./ResourceTypeIcon";

export default function ResourceListView({ codeLabel = "Code", nameLabel = "Nom", items, projects, matches, query, onOpenItem, emptyLabel }) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState("encours");

  const types = useMemo(
    () => [...new Set(items.map((it) => it.type).filter(Boolean))],
    [items]
  );
  const hasCalibration = useMemo(() => items.some((it) => it.prochaineCalibration), [items]);

  const rows = useMemo(() => {
    const filtered = items
      .map((it) => ({ item: it, stats: computeResourceStats(it, projects, matches) }))
      .filter(
        ({ item }) => !query || item.nom.toLowerCase().includes(query.toLowerCase()) || item.id.toLowerCase().includes(query.toLowerCase())
      )
      .filter(({ item }) => filterStatus === "all" || (item.status || "operationnel") === filterStatus)
      .filter(({ item }) => filterType === "all" || item.type === filterType)
      .filter(({ item }) => !overdueOnly || isPastDue(item.prochaineCalibration));
    const sorted = [...filtered];
    if (sortKey === "encours") sorted.sort((a, b) => b.stats.enCours - a.stats.enCours || b.stats.nbUsageTotal - a.stats.nbUsageTotal || a.item.nom.localeCompare(b.item.nom));
    else if (sortKey === "nom") sorted.sort((a, b) => a.item.nom.localeCompare(b.item.nom));
    else if (sortKey === "utilisations") sorted.sort((a, b) => b.stats.nbUsageTotal - a.stats.nbUsageTotal || a.item.nom.localeCompare(b.item.nom));
    return sorted;
  }, [items, projects, matches, query, filterStatus, filterType, overdueOnly, sortKey]);

  const hasActiveFilters = filterStatus !== "all" || filterType !== "all" || overdueOnly;

  return (
    <>
      <div className="gt-projtoolbar" style={{ borderBottom: "none", paddingBottom: 0 }}>
        <div className="gt-projtoolbar-group">
          <span className="gt-projtoolbar-label">Statut</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Tous</option>
            {RESOURCE_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        {types.length > 1 && (
          <div className="gt-projtoolbar-group">
            <span className="gt-projtoolbar-label">Type</span>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">Tous</option>
              {types.map((t) => (
                <option key={t} value={t}>{RESOURCE_TYPES.find((rt) => rt.key === t)?.label || t}</option>
              ))}
            </select>
          </div>
        )}

        <div className="gt-projtoolbar-group">
          <span className="gt-projtoolbar-label">Trier par</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="encours">En cours</option>
            <option value="nom">Nom (A→Z)</option>
            <option value="utilisations">Nb. utilisations</option>
          </select>
        </div>

        {hasCalibration && (
          <div className="gt-viewtoggle" style={{ alignSelf: "flex-end" }}>
            <button type="button" className={overdueOnly ? "active" : ""} onClick={() => setOverdueOnly((v) => !v)}>
              <AlertTriangle size={12} /> Étalonnage en retard
            </button>
          </div>
        )}

        {hasActiveFilters && (
          <button
            className="gt-btn gt-btn-neutral gt-projtoolbar-reset"
            style={{ marginTop: 0 }}
            onClick={() => { setFilterStatus("all"); setFilterType("all"); setOverdueOnly(false); }}
          >
            Réinitialiser
          </button>
        )}
      </div>

      <ResponsiveTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{codeLabel}</TableHead>
              <TableHead>{nameLabel}</TableHead>
              <TableHead className="hide-mobile">Marque / modèle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="hide-mobile">Utilisations</TableHead>
              <TableHead>En cours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {rows.map(({ item, stats }) => {
            const statusInfo = RESOURCE_STATUSES.find((s) => s.key === (item.status || "operationnel"));
            const overdue = isPastDue(item.prochaineCalibration);
            return (
              <TableRow key={item.id} className="cursor-pointer" onClick={() => onOpenItem(item.id)}>
                <TableCell className="font-mono">{item.id}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-muted-foreground"><ResourceTypeIcon type={item.type} size={14} /></span>
                    <span className="font-semibold">{item.nom}</span>
                  </span>
                  {stats.enCours > 0 && (
                    <span className="gt-status-pill info" style={{ display: "inline-flex", marginLeft: 8 }}>
                      {stats.enCours} en cours
                    </span>
                  )}
                  {overdue && (
                    <span className="gt-status-pill danger" style={{ display: "inline-flex", marginLeft: 8 }}>
                      <AlertTriangle size={11} /> Étalonnage en retard
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hide-mobile">
                  {item.marque || item.modele ? `${item.marque || "—"} ${item.modele || ""}`.trim() : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {statusInfo && (
                    <span className={`gt-status-pill ${statusInfo.pill}`}>
                      <span className="gt-status-pill-dot" />{statusInfo.label}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hide-mobile">{stats.nbUsageTotal}</TableCell>
                <TableCell>
                  {stats.enCours > 0 ? stats.enCours : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground text-center">
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        </Table>
      </ResponsiveTableCard>
    </>
  );
}
