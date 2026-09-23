import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateFR, isDateWithinRange } from "../utils/dates";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MAX_CHIPS_PER_DAY = 3;

function monthLabel(cursor) {
  const label = cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const initials = (nom) => nom.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/**
 * Who's out and when, at a glance — the list view is per-employee, this is per-day, which is
 * what Dispatcher actually needs when planning a field assignment ("is anyone out that week").
 */
export default function CongeCalendar({ employees, onOpenEmployee }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const entries = useMemo(() => {
    const out = [];
    employees.forEach((emp) => {
      (emp.conges || []).forEach((conge) => {
        if (conge.statut === "refuse") return;
        out.push({ employee: emp, conge });
      });
    });
    return out;
  }, [employees]);

  const weeks = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push({ date: new Date(year, month, i - firstWeekday + 1), inMonth: false });
    for (let day = 1; day <= daysInMonth; day += 1) cells.push({ date: new Date(year, month, day), inMonth: true });
    while (cells.length % 7 !== 0) cells.push({ date: new Date(year, month, cells.length - firstWeekday - daysInMonth + 1), inMonth: false });
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cursor]);

  const now = new Date();
  const monthCount = weeks.flat().filter((c) => c.inMonth).reduce((sum, c) => {
    const key = formatDateFR(c.date);
    return sum + entries.filter((e) => isDateWithinRange(key, e.conge.dateDebut, e.conge.dateFin)).length;
  }, 0);

  return (
    <div className="cg-cal">
      <div className="cg-cal-toolbar">
        <div className="cg-cal-month">
          <span>{monthLabel(cursor)}</span>
          <span className="cg-cal-monthcount">{monthCount} jour{monthCount > 1 ? "s" : ""} d'absence cumulés</span>
        </div>
        <div className="cg-cal-nav">
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Mois précédent">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="cg-cal-today" onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))}>
            Aujourd'hui
          </button>
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Mois suivant">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="cg-cal-weekdays">
        {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
      </div>

      <div className="cg-cal-grid">
        {weeks.flat().map(({ date, inMonth }, i) => {
          const key = formatDateFR(date);
          const dayEntries = entries.filter((e) => isDateWithinRange(key, e.conge.dateDebut, e.conge.dateFin));
          const shown = dayEntries.slice(0, MAX_CHIPS_PER_DAY);
          const hidden = dayEntries.length - shown.length;
          const isToday = sameDay(date, now);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div key={i} className={`cg-cal-cell ${inMonth ? "" : "is-outside"} ${isWeekend ? "is-weekend" : ""}`}>
              <span className={`cg-cal-daynum ${isToday ? "is-today" : ""}`}>{date.getDate()}</span>
              <div className="cg-cal-chips">
                {shown.map(({ employee, conge }) => (
                  <button
                    key={`${employee.id}-${conge.id}`}
                    type="button"
                    className={`cg-cal-chip is-${conge.statut}`}
                    onClick={() => onOpenEmployee(employee.id)}
                    title={`${employee.nom} — ${conge.type}${conge.statut === "en_attente" ? " (en attente)" : ""}`}
                  >
                    <span className="cg-cal-chip-initials">{initials(employee.nom)}</span>
                    <span className="cg-cal-chip-name">{employee.nom.split(" ")[0]}</span>
                  </button>
                ))}
                {hidden > 0 && <span className="cg-cal-more">+{hidden}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="cg-cal-legend">
        <span><i className="is-approuve" /> Approuvé</span>
        <span><i className="is-en_attente" /> En attente</span>
      </div>
    </div>
  );
}
