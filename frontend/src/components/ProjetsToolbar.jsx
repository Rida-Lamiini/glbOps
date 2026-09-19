import React, { useState } from "react";
import { List, LayoutGrid, SlidersHorizontal, X } from "lucide-react";
import { STAGES } from "../constants";
import { DatePicker } from "@/components/ui/date-picker";

export default function ProjetsToolbar({
  clients,
  agents,
  filterStage,
  setFilterStage,
  filterClient,
  setFilterClient,
  filterAgent,
  setFilterAgent,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  sortKey,
  setSortKey,
  boardMode,
  setBoardMode,
}) {
  const [open, setOpen] = useState(false);
  const hasActiveFilters = filterStage !== "all" || filterClient !== "all" || filterAgent !== "all" || dateFrom || dateTo;

  const activeCount = [filterStage, filterClient, filterAgent].filter((v) => v !== "all").length + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const resetFilters = () => {
    setFilterStage("all");
    setFilterClient("all");
    setFilterAgent("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="gt-projtoolbar">
      <button type="button" className="gt-filtertoggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={14} /> Filtres{activeCount > 0 && <span className="gt-filtertoggle-count">{activeCount}</span>}
      </button>
      <div className={`gt-projtoolbar-filters ${open ? "is-open" : ""}`}>
      <div className="gt-projtoolbar-group">
        <span className="gt-projtoolbar-label"><SlidersHorizontal size={10} /> Étape</span>
        <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
          <option value="all">Toutes</option>
          <option value="nonconforme">Non conformes</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="gt-projtoolbar-group">
        <span className="gt-projtoolbar-label">Client</span>
        <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
          <option value="all">Tous</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
      </div>

      <div className="gt-projtoolbar-group">
        <span className="gt-projtoolbar-label">Agent chantier</span>
        <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
          <option value="all">Tous</option>
          {agents.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="gt-projtoolbar-group">
        <span className="gt-projtoolbar-label">Du</span>
        <DatePicker value={dateFrom} onChange={setDateFrom} className="min-w-[140px]" />
      </div>

      <div className="gt-projtoolbar-group">
        <span className="gt-projtoolbar-label">Au</span>
        <DatePicker value={dateTo} onChange={setDateTo} className="min-w-[140px]" />
      </div>

      <div className="gt-projtoolbar-group">
        <span className="gt-projtoolbar-label">Trier par</span>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="recent">Date — récent d'abord</option>
          <option value="ancien">Date — ancien d'abord</option>
          <option value="client">Client (A→Z)</option>
          <option value="prestations">Nb. prestations</option>
        </select>
      </div>

      {hasActiveFilters && (
        <button className="gt-btn gt-btn-neutral gt-projtoolbar-reset" style={{ marginTop: 0 }} onClick={resetFilters}>
          <X size={13} /> Réinitialiser
        </button>
      )}

      </div>

      <div className="gt-viewtoggle" style={hasActiveFilters ? undefined : { marginLeft: "auto" }}>
        <button className={boardMode === "list" ? "active" : ""} onClick={() => setBoardMode("list")}>
          <List size={13} /> Liste
        </button>
        <button className={boardMode === "kanban" ? "active" : ""} onClick={() => setBoardMode("kanban")}>
          <LayoutGrid size={13} /> Kanban
        </button>
      </div>
    </div>
  );
}
