import React, { useMemo, useState } from "react";
import ResponsiveTableCard from "./ResponsiveTableCard";
import { AlertTriangle } from "lucide-react";
import { computeClientStats } from "../utils/stats";
import { formatTimestamp } from "../utils/dates";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const initials = (nom) => nom.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function ClientsView({ clients, projects, query, onOpenClient, isOffice }) {
  const [filterSecteur, setFilterSecteur] = useState("all");
  const [nonConfOnly, setNonConfOnly] = useState(false);
  const [sortKey, setSortKey] = useState("projets");

  const secteurs = useMemo(
    () => [...new Set(clients.map((c) => c.secteur).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [clients]
  );

  const summary = useMemo(() => {
    const stats = clients.map((c) => computeClientStats(c, projects));
    return {
      clients: stats.filter((st) => st.nbProjects > 0 || isOffice).length,
      projets: stats.reduce((n, st) => n + st.nbProjects, 0),
      enCours: stats.reduce((n, st) => n + st.enCours, 0),
      nonConf: stats.filter((st) => st.nonConf > 0).length,
    };
  }, [clients, projects, isOffice]);

  const rows = useMemo(() => {
    const filtered = clients
      .map((c) => ({ client: c, stats: computeClientStats(c, projects) }))
      .filter(({ stats }) => stats.nbProjects > 0 || isOffice)
      .filter(({ client }) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return client.nom.toLowerCase().includes(q) || client.code.toLowerCase().includes(q);
      })
      .filter(({ client }) => filterSecteur === "all" || client.secteur === filterSecteur)
      .filter(({ stats }) => !nonConfOnly || stats.nonConf > 0);
    const sorted = [...filtered];
    if (sortKey === "projets") sorted.sort((a, b) => b.stats.nbProjects - a.stats.nbProjects || a.client.nom.localeCompare(b.client.nom));
    else if (sortKey === "nom") sorted.sort((a, b) => a.client.nom.localeCompare(b.client.nom));
    else if (sortKey === "activite") sorted.sort((a, b) => (b.stats.lastActivity || 0) - (a.stats.lastActivity || 0));
    else if (sortKey === "nonconf") sorted.sort((a, b) => b.stats.nonConf - a.stats.nonConf || a.client.nom.localeCompare(b.client.nom));
    return sorted;
  }, [clients, projects, query, isOffice, filterSecteur, nonConfOnly, sortKey]);

  const hasActiveFilters = filterSecteur !== "all" || nonConfOnly;

  return (
    <>
      <div className="rg-ledger" role="group" aria-label="Synthèse">
        <div className="rg-ledger-cell"><span>Clients</span><strong>{summary.clients}</strong></div>
        <div className="rg-ledger-cell"><span>Projets</span><strong>{summary.projets}</strong></div>
        <div className="rg-ledger-cell"><span>Prestations en cours</span><strong>{summary.enCours}</strong></div>
        <button type="button" className={`rg-ledger-cell ${summary.nonConf ? "is-bad" : ""} ${nonConfOnly ? "is-on" : ""}`} onClick={() => setNonConfOnly((v) => !v)}>
          <span>Avec non-conformité</span><strong>{summary.nonConf}</strong>
        </button>
      </div>

      <div className="rg-filters">
        {secteurs.length > 0 && (
          <div className="rg-seg" role="group" aria-label="Secteur">
            {[{ key: "all", label: "Tous", n: clients.length }, ...secteurs.map((sc) => ({ key: sc, label: sc, n: clients.filter((c) => c.secteur === sc).length }))].map((o) => (
              <button key={o.key} type="button" className={filterSecteur === o.key ? "is-on" : ""} onClick={() => setFilterSecteur(o.key)}>
                {o.label}<i>{o.n}</i>
              </button>
            ))}
          </div>
        )}
        <div className="rg-filters-end">
          <button type="button" className={`rg-chip-toggle ${nonConfOnly ? "is-on" : ""}`} onClick={() => setNonConfOnly((v) => !v)}>
            <AlertTriangle size={13} /> Avec non-conformité
          </button>
          <label className="rg-sort">
            <span>Trier</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="projets">Nb. projets</option>
              <option value="nom">Nom (A→Z)</option>
              <option value="activite">Activité récente</option>
              <option value="nonconf">Non-conformités</option>
            </select>
          </label>
          {hasActiveFilters && (
            <button type="button" className="rg-reset" onClick={() => { setFilterSecteur("all"); setNonConfOnly(false); }}>Réinitialiser</button>
          )}
        </div>
      </div>

      <ResponsiveTableCard className="rg-table" minBreakpoint={520} pxPerColumn={90}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead className="hide-mobile">Secteur</TableHead>
              <TableHead className="rg-num">Projets</TableHead>
              <TableHead className="rg-num hide-mobile">Prestations</TableHead>
              <TableHead className="rg-num">En cours</TableHead>
              <TableHead>Non-conformité</TableHead>
              <TableHead className="hide-mobile">Dernière activité</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ client, stats }) => (
              <TableRow key={client.id} className="cursor-pointer" onClick={() => onOpenClient(client.id)}>
                <TableCell>
                  <span className="rg-cellmain">
                    <span className="rg-mono" aria-hidden="true">{initials(client.nom)}</span>
                    <span className="rg-celltext">
                      <span className="rg-cellname">{client.nom}</span>
                      <span className="rg-cellsub"><span className="gt-mono">{client.code}</span>{client.contact ? ` · ${client.contact}` : ""}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="hide-mobile">
                  {client.secteur ? <span className="rg-role">{client.secteur}</span> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className={`rg-num ${stats.nbProjects ? "" : "is-zero"}`}>{stats.nbProjects}</TableCell>
                <TableCell className={`rg-num hide-mobile ${stats.nbPrestations ? "" : "is-zero"}`}>{stats.nbPrestations}</TableCell>
                <TableCell className={`rg-num ${stats.enCours ? "" : "is-zero"}`}>{stats.enCours}</TableCell>
                <TableCell>
                  {stats.nonConf > 0 ? (
                    <span className="gt-status-pill danger">
                      <AlertTriangle size={11} /> {stats.nonConf}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hide-mobile">
                  {stats.lastActivity != null ? formatTimestamp(stats.lastActivity) : "—"}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-center">
                  Aucun client ne correspond.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ResponsiveTableCard>
    </>
  );
}
