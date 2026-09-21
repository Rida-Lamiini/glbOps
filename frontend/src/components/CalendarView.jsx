import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, AlertTriangle, Palmtree } from "lucide-react";
import { STAGES, STAGE_COLORS, WEEKDAY_LABELS } from "../constants";
import { today, activeCongeOn } from "../utils/dates";
import { bookingsFromProjets, groupBookingsByDate, conflictingIds } from "../utils/bookings";
import { buildMonthGrid, buildWeekGrid } from "../utils/calendarGrid";
import { selectableAgentsByRole } from "../utils/employees";
import { fadeUpVariants } from "../lib/motionVariants";

const dateKey = (d) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const MAX_CHIPS_MONTH = 3;

// "Sara Benjelloun" -> "Sara B."
const shortName = (nom) => {
  const [first, ...rest] = nom.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};
const initials = (nom) => nom.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label || key;

function Chip({ prestation, projet, conflicts, getClient, onOpenPrestation, compact }) {
  const client = getClient(projet.clientId)?.nom || projet.id;
  const agents = (prestation.agentChantier || []).map(shortName).join(", ") || "—";
  return (
    <button
      className={`cv-chip ${conflicts.has(prestation.id) ? "conflict" : ""}`}
      style={{ borderLeftColor: STAGE_COLORS[prestation.stage] }}
      onClick={() => onOpenPrestation(prestation.id)}
      title={`${prestation.id} — ${client} · ${stageLabel(prestation.stage)}`}
    >
      <span className="cv-chip-main">
        {conflicts.has(prestation.id) && <AlertTriangle size={11} className="gt-cal-chip-warn" />}
        <b>{client}</b>
      </span>
      {!compact && <small>{agents} · {stageLabel(prestation.stage)}</small>}
    </button>
  );
}

function DayCell({ date, inMonth, todayKey, dayBookings, conflicts, leaves, onOpenPrestation, getClient, onExpand, week }) {
  const key = dateKey(date);
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const shown = week ? dayBookings : dayBookings.slice(0, MAX_CHIPS_MONTH);
  const hidden = dayBookings.length - shown.length;
  return (
    <div className={`cv-cell ${inMonth ? "" : "outmonth"} ${key === todayKey ? "today" : ""} ${weekend ? "weekend" : ""} ${conflicts.size ? "has-conflict" : ""}`}>
      <div className="cv-daynum">
        <span>{date.getDate()}</span>
        {week && <em>{date.toLocaleDateString("fr-FR", { month: "short" })}</em>}
      </div>
      <div className="cv-chips">
        {shown.map(({ prestation, projet }) => (
          <Chip key={prestation.id} prestation={prestation} projet={projet} conflicts={conflicts} getClient={getClient} onOpenPrestation={onOpenPrestation} compact={!week && dayBookings.length > 1} />
        ))}
        {hidden > 0 && (
          <button className="cv-more" onClick={() => onExpand(date)}>+ {hidden} autre{hidden > 1 ? "s" : ""}</button>
        )}
        {leaves.map((name) => (
          <span key={name} className="cv-leave"><Palmtree size={10} /> {shortName(name)}</span>
        ))}
      </div>
    </div>
  );
}

export default function CalendarView({ projects, employees, getClient, onOpenPrestation }) {
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("mois"); // mois | semaine | agents
  const [filterStage, setFilterStage] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const todayKey = today();

  // Active chantier agents, plus whoever is currently selected in the filter even if they've
  // since been deactivated, so an existing filter selection doesn't silently break.
  const chantierAgents = useMemo(
    () => selectableAgentsByRole(employees, "Agent Chantier", [filterAgent]).map((e) => ({ name: e.nom, role: e.poste, conges: e.conges })),
    [employees, filterAgent]
  );

  const allBookings = useMemo(() => bookingsFromProjets(projects), [projects]);
  const filteredBookings = useMemo(() => {
    return allBookings.filter(({ prestation }) => {
      if (filterStage !== "all" && prestation.stage !== filterStage) return false;
      if (filterAgent !== "all" && !(prestation.agentChantier || []).includes(filterAgent)) return false;
      return true;
    });
  }, [allBookings, filterStage, filterAgent]);

  const bookingsByDate = useMemo(() => groupBookingsByDate(filteredBookings), [filteredBookings]);

  const monthCells = useMemo(() => {
    const cells = buildMonthGrid(anchorDate);
    while (cells.length > 35 && cells.slice(-7).every((c) => !c.inMonth)) cells.length -= 7;
    return cells;
  }, [anchorDate]);
  const weekCells = useMemo(() => buildWeekGrid(anchorDate), [anchorDate]);
  const cells = viewMode === "mois" ? monthCells : weekCells;
  const periodCells = cells.filter((c) => c.inMonth);

  const visibleAgents = filterAgent === "all" ? chantierAgents : chantierAgents.filter((a) => a.name === filterAgent);

  const leaveOn = (key, agents) => agents.filter((a) => activeCongeOn(a.conges, key)).map((a) => a.name);

  const stats = useMemo(() => {
    let visites = 0;
    let conflictDays = 0;
    const onLeave = new Set();
    periodCells.forEach(({ date }) => {
      const key = dateKey(date);
      const list = bookingsByDate[key] || [];
      visites += list.length;
      if (conflictingIds(list).size > 0) conflictDays += 1;
      leaveOn(key, visibleAgents).forEach((n) => onLeave.add(n));
    });
    return { visites, conflictDays, conges: onLeave.size, aujourdhui: (bookingsByDate[todayKey] || []).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodCells, bookingsByDate, visibleAgents, todayKey]);

  const goPrev = () => setAnchorDate((d) => {
    const n = new Date(d);
    if (viewMode === "mois") n.setMonth(n.getMonth() - 1);
    else n.setDate(n.getDate() - 7);
    return n;
  });
  const goNext = () => setAnchorDate((d) => {
    const n = new Date(d);
    if (viewMode === "mois") n.setMonth(n.getMonth() + 1);
    else n.setDate(n.getDate() + 7);
    return n;
  });
  const goToday = () => setAnchorDate(new Date());
  const expandDay = (date) => { setAnchorDate(date); setViewMode("semaine"); };

  const monthName = anchorDate.toLocaleDateString("fr-FR", { month: "long" });
  const title = viewMode === "mois"
    ? { main: monthName, sub: String(anchorDate.getFullYear()) }
    : {
        main: `${weekCells[0].date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${weekCells[6].date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`,
        sub: String(weekCells[6].date.getFullYear()),
      };
  const periodWord = viewMode === "mois" ? "ce mois" : "cette semaine";

  return (
    <div className="gt-cal-wrap cv">
      <header className="cv-head">
        <div className="cv-title">
          <span className="cv-eyebrow">Planning terrain</span>
          <h2>{title.main} <em>{title.sub}</em></h2>
        </div>
        <div className="cv-nav">
          <button className="cv-navbtn" onClick={goPrev} aria-label="Précédent"><ChevronLeft size={18} /></button>
          <button className="cv-today" onClick={goToday}>Aujourd'hui</button>
          <button className="cv-navbtn" onClick={goNext} aria-label="Suivant"><ChevronRight size={18} /></button>
        </div>
        <div className="rg-seg cv-seg" role="group" aria-label="Affichage">
          {[["mois", "Mois"], ["semaine", "Semaine"], ["agents", "Agents"]].map(([k, l]) => (
            <button key={k} type="button" className={viewMode === k ? "is-on" : ""} onClick={() => setViewMode(k)}>{l}</button>
          ))}
        </div>
      </header>

      <div className="rg-ledger cv-ledger" role="group" aria-label="Synthèse">
        <div className="rg-ledger-cell"><span>Visites planifiées</span><strong>{stats.visites}</strong><small>{periodWord}</small></div>
        <div className="rg-ledger-cell"><span>Aujourd'hui</span><strong className={stats.aujourdhui ? "" : "is-zero"}>{stats.aujourdhui}</strong><small>visite{stats.aujourdhui > 1 ? "s" : ""} sur le terrain</small></div>
        <div className={`rg-ledger-cell ${stats.conflictDays ? "is-bad" : ""}`}><span>Jours en conflit</span><strong className={stats.conflictDays ? "" : "is-zero"}>{stats.conflictDays}</strong><small>{stats.conflictDays ? "agent ou véhicule en double" : "aucun conflit"}</small></div>
        <div className={`rg-ledger-cell ${stats.conges ? "is-warn" : ""}`}><span>Agents en congé</span><strong className={stats.conges ? "" : "is-zero"}>{stats.conges}</strong><small>{periodWord}</small></div>
      </div>

      <div className="rg-filters cv-filters">
        <div className="rg-chips cv-stagechips" role="group" aria-label="Étape">
          {STAGES.map((s) => (
            <button key={s.key} type="button" className={filterStage === s.key ? "is-on" : ""} onClick={() => setFilterStage(filterStage === s.key ? "all" : s.key)}>
              <span className="rg-dot" style={{ background: STAGE_COLORS[s.key] }} />{s.label}
            </button>
          ))}
        </div>
        <div className="rg-filters-end">
          <label className="rg-sort">
            <span>Agent</span>
            <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
              <option value="all">Tous les agents</option>
              {chantierAgents.map((a) => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
          </label>
          {(filterStage !== "all" || filterAgent !== "all") && (
            <button type="button" className="rg-reset" onClick={() => { setFilterStage("all"); setFilterAgent("all"); }}>Réinitialiser</button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === "agents" ? (
          <motion.div className="cv-lanes" key="agents" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <div className="cv-lane-head">
              <div className="cv-lane-headcell">Agent</div>
              {weekCells.map(({ date }) => (
                <div className={`cv-lane-headcell ${dateKey(date) === todayKey ? "today" : ""}`} key={dateKey(date)}>
                  {WEEKDAY_LABELS[(date.getDay() + 6) % 7]} <b>{date.getDate()}</b>
                </div>
              ))}
            </div>
            {visibleAgents.map((agent) => (
              <div className="cv-lane-row" key={agent.name}>
                <div className="cv-lane-label">
                  <span className="rg-mono gt-dash-mono" aria-hidden="true">{initials(agent.name)}</span>
                  <span className="rg-celltext"><span className="rg-cellname">{agent.name}</span><span className="rg-cellsub">{agent.role}</span></span>
                </div>
                {weekCells.map(({ date }) => {
                  const key = dateKey(date);
                  const dayBookings = (bookingsByDate[key] || []).filter(({ prestation }) => (prestation.agentChantier || []).includes(agent.name));
                  const conflicts = conflictingIds(bookingsByDate[key] || []);
                  const onLeave = !!activeCongeOn(agent.conges, key);
                  const weekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <div className={`cv-lane-cell ${onLeave ? "on-leave" : ""} ${weekend ? "weekend" : ""}`} key={key}>
                      {onLeave && <span className="cv-leave"><Palmtree size={10} /> Congé</span>}
                      {dayBookings.map(({ prestation, projet }) => (
                        <Chip key={prestation.id} prestation={prestation} projet={projet} conflicts={conflicts} getClient={getClient} onOpenPrestation={onOpenPrestation} />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
            {visibleAgents.length === 0 && <div className="gt-list-empty">Aucun agent ne correspond.</div>}
          </motion.div>
        ) : (
          <motion.div key={viewMode} variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }} className={`cv-sheet ${viewMode === "semaine" ? "is-week" : ""}`}>
            <div className="cv-weekdays">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="cv-days">
              {cells.map(({ date, inMonth }, i) => {
                const key = dateKey(date);
                const dayBookings = bookingsByDate[key] || [];
                return (
                  <DayCell
                    key={i}
                    date={date}
                    inMonth={inMonth}
                    todayKey={todayKey}
                    dayBookings={dayBookings}
                    conflicts={conflictingIds(dayBookings)}
                    leaves={inMonth ? leaveOn(key, visibleAgents) : []}
                    onOpenPrestation={onOpenPrestation}
                    getClient={getClient}
                    onExpand={expandDay}
                    week={viewMode === "semaine"}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
