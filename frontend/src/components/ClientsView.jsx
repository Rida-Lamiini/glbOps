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

export default function ClientsView({ clients, projects, query, onOpenClient, isOffice }) {
  const [filterSecteur, setFilterSecteur] = useState("all");
  const [nonConfOnly, setNonConfOnly] = useState(false);
  const [sortKey, setSortKey] = useState("projets");

  const secteurs = useMemo(
    () => [...new Set(clients.map((c) => c.secteur).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [clients]
  );

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
      <div className="gt-projtoolbar" style={{ borderBottom: "none", paddingBottom: 0 }}>
        <div className="gt-projtoolbar-group">
          <span className="gt-projtoolbar-label">Secteur</span>
          <select value={filterSecteur} onChange={(e) => setFilterSecteur(e.target.value)}>
            <option value="all">Tous</option>
            {secteurs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="gt-projtoolbar-group">
          <span className="gt-projtoolbar-label">Trier par</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="projets">Nb. projets</option>
            <option value="nom">Nom (A→Z)</option>
            <option value="activite">Activité récente</option>
            <option value="nonconf">Non-conformités</option>
          </select>
        </div>

        <div className="gt-viewtoggle" style={{ alignSelf: "flex-end" }}>
          <button type="button" className={nonConfOnly ? "active" : ""} onClick={() => setNonConfOnly((v) => !v)}>
            <AlertTriangle size={12} /> Avec non-conformité
          </button>
        </div>

        {hasActiveFilters && (
          <button
            className="gt-btn gt-btn-neutral gt-projtoolbar-reset"
            style={{ marginTop: 0 }}
            onClick={() => { setFilterSecteur("all"); setNonConfOnly(false); }}
          >
            Réinitialiser
          </button>
        )}
      </div>

      <ResponsiveTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="hide-mobile">Secteur</TableHead>
              <TableHead>Projets</TableHead>
              <TableHead className="hide-mobile">Prestations</TableHead>
              <TableHead>En cours</TableHead>
              <TableHead>Non-conformité</TableHead>
              <TableHead className="hide-mobile">Dernière activité</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {rows.map(({ client, stats }) => (
            <TableRow key={client.id} className="cursor-pointer" onClick={() => onOpenClient(client.id)}>
              <TableCell className="font-mono">{client.code}</TableCell>
              <TableCell>
                <span className="font-semibold">{client.nom}</span>
                {stats.nbProjects > 1 && (
                  <span className="gt-status-pill warning" style={{ display: "inline-flex", marginLeft: 8 }}>
                    {stats.nbProjects} projets liés
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground hide-mobile">{client.secteur || "—"}</TableCell>
              <TableCell>{stats.nbProjects}</TableCell>
              <TableCell className="hide-mobile">{stats.nbPrestations}</TableCell>
              <TableCell>{stats.enCours}</TableCell>
              <TableCell>
                {stats.nonConf > 0 ? (
                  <span className="gt-status-pill danger" style={{ display: "inline-flex" }}>
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
              <TableCell colSpan={8} className="text-muted-foreground text-center">
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
