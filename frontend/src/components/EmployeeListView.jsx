import React, { useMemo, useState } from "react";
import ResponsiveTableCard from "./ResponsiveTableCard";
import CongeCalendar from "./CongeCalendar";
import { Palmtree, List, CalendarDays } from "lucide-react";
import { computeEmployeeStats } from "../utils/stats";
import { activeCongeOn, today } from "../utils/dates";
import { EMPLOYEE_STATUSES, ROLES } from "../constants";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const initials = (nom) => nom.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function EmployeeListView({ items, projects, query, onOpenItem }) {
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [mode, setMode] = useState("list");
  const todayKey = today();

  const all = useMemo(
    () => items.map((it) => ({ item: it, stats: computeEmployeeStats(it, projects), onLeave: !!activeCongeOn(it.conges, todayKey) })),
    [items, projects, todayKey]
  );

  const summary = useMemo(() => ({
    total: all.length,
    actifs: all.filter(({ item }) => (item.status || "actif") === "actif").length,
    conge: all.filter((r) => r.onLeave).length,
    mission: all.filter((r) => r.stats.enCours > 0).length,
  }), [all]);

  const roles = useMemo(() => ROLES.filter((r) => items.some((it) => it.role === r)), [items]);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return all
      .filter(({ item }) => !query || item.nom.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
      .filter(({ item }) => filterRole === "all" || item.role === filterRole)
      .filter(({ item }) => filterStatus === "all" || (item.status || "actif") === filterStatus)
      .sort((a, b) => a.item.role.localeCompare(b.item.role) || a.item.nom.localeCompare(b.item.nom));
  }, [all, query, filterRole, filterStatus]);

  const hasActiveFilters = filterRole !== "all" || filterStatus !== "all";

  return (
    <>
      <div className="rg-ledger" role="group" aria-label="Synthèse">
        <div className="rg-ledger-cell"><span>Effectif</span><strong>{summary.total}</strong></div>
        <div className="rg-ledger-cell is-ok"><span>Actifs</span><strong>{summary.actifs}</strong></div>
        <div className={`rg-ledger-cell ${summary.conge ? "is-warn" : ""}`}><span>En congé aujourd'hui</span><strong>{summary.conge}</strong></div>
        <div className="rg-ledger-cell"><span>En mission</span><strong>{summary.mission}</strong></div>
      </div>

      <div className="rg-filters">
        <div className="rg-seg" role="group" aria-label="Rôle">
          {[{ key: "all", label: "Tous", n: items.length }, ...roles.map((r) => ({ key: r, label: r, n: items.filter((it) => it.role === r).length }))].map((o) => (
            <button key={o.key} type="button" className={filterRole === o.key ? "is-on" : ""} onClick={() => setFilterRole(o.key)}>
              {o.label}<i>{o.n}</i>
            </button>
          ))}
        </div>
        <div className="rg-chips" role="group" aria-label="Statut">
          {EMPLOYEE_STATUSES.map((st) => (
            <button key={st.key} type="button" className={filterStatus === st.key ? "is-on" : ""} onClick={() => setFilterStatus(filterStatus === st.key ? "all" : st.key)}>
              <span className="rg-dot" style={{ background: st.color }} />{st.label}
            </button>
          ))}
        </div>
        <div className="rg-filters-end" style={hasActiveFilters ? undefined : { marginLeft: "auto" }}>
          {hasActiveFilters && (
            <button type="button" className="rg-reset" onClick={() => { setFilterRole("all"); setFilterStatus("all"); }}>Réinitialiser</button>
          )}
          <div className="gt-viewtoggle">
            <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>
              <List size={13} /> Liste
            </button>
            <button type="button" className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>
              <CalendarDays size={13} /> Congés
            </button>
          </div>
        </div>
      </div>

      {mode === "calendar" ? (
        <CongeCalendar employees={items} onOpenEmployee={onOpenItem} />
      ) : (
      <ResponsiveTableCard className="rg-table" minBreakpoint={520} pxPerColumn={90}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>Poste</TableHead>
              <TableHead className="hide-mobile">Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="rg-num">En cours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ item, stats, onLeave }) => {
              const statusInfo = EMPLOYEE_STATUSES.find((s) => s.key === (item.status || "actif"));
              return (
                <TableRow key={item.id} className={`cursor-pointer ${item.status === "inactif" ? "is-dim" : ""}`} onClick={() => onOpenItem(item.id)}>
                  <TableCell>
                    <span className="rg-cellmain">
                      <span className="rg-mono" aria-hidden="true">{initials(item.nom)}</span>
                      <span className="rg-celltext">
                        <span className="rg-cellname">{item.nom}</span>
                        <span className="rg-cellsub"><span className="gt-mono">{item.id}</span>{item.email ? ` · ${item.email}` : ""}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>{item.poste || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hide-mobile"><span className="rg-role">{item.role}</span></TableCell>
                  <TableCell>
                    <span className="rg-statuscell">
                      {statusInfo && (
                        <span className={`gt-status-pill ${statusInfo.pill}`}>
                          <span className="gt-status-pill-dot" />{statusInfo.label}
                        </span>
                      )}
                      {onLeave && (
                        <span className="gt-status-pill warning"><Palmtree size={11} /> En congé</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={`rg-num ${stats.enCours ? "" : "is-zero"}`}>{stats.enCours || "—"}</TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  Aucun employé ne correspond.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ResponsiveTableCard>
      )}
    </>
  );
}
