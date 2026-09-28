import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseDateFR, formatDateFR } from "../utils/dates";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MAX_PILLS = 3;

const monthLabel = (d) => {
  const s = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Month grid used by the agents' agendas (same look as the bureau agenda: `ab-cal-*`).
 *  items: [{ id, date: "dd/mm/yyyy[ hh:mm]", title, color, tooltip, onClick }]
 *  legend: [{ label, color }] shown under the toolbar. */
export default function MonthAgenda({ items, legend = [], countLabel = (n) => `${n} dossier${n > 1 ? "s" : ""}` }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const map = new Map();
    items.forEach((it) => {
      const t = parseDateFR(it.date);
      if (t == null) return;
      const key = formatDateFR(new Date(t));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    return map;
  }, [items]);

  const cells = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
    const days = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < lead; i += 1) out.push({ date: new Date(y, m, i - lead + 1), inMonth: false });
    for (let d = 1; d <= days; d += 1) out.push({ date: new Date(y, m, d), inMonth: true });
    while (out.length % 7 !== 0) out.push({ date: new Date(y, m, out.length - lead - days + 1), inMonth: false });
    return out;
  }, [cursor]);

  const now = new Date();
  const monthTotal = cells.filter((c) => c.inMonth).reduce((n, c) => n + (byDay.get(formatDateFR(c.date))?.length || 0), 0);

  return (
    <div className="ab-cal">
      <div className="ab-cal-toolbar">
        <div className="ab-cal-month">
          <span>{monthLabel(cursor)}</span>
          <span className="ab-cal-monthcount">{countLabel(monthTotal)}</span>
        </div>
        <div className="ab-cal-nav">
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Mois précédent"><ChevronLeft size={16} /></button>
          <button type="button" className="ab-cal-today" onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))}>Aujourd'hui</button>
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Mois suivant"><ChevronRight size={16} /></button>
        </div>
      </div>

      {legend.length > 0 && (
        <div className="ab-cal-legend" aria-label="Légende">
          {legend.map((l) => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}
        </div>
      )}

      <div className="ab-cal-weekdays">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>

      <div className="ab-cal-grid">
        {cells.map(({ date, inMonth }, i) => {
          const list = byDay.get(formatDateFR(date)) || [];
          const shown = list.slice(0, MAX_PILLS);
          const hidden = list.length - shown.length;
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div key={i} className={`ab-cal-cell ${inMonth ? "" : "is-outside"} ${weekend ? "is-weekend" : ""} ${list.length ? "has-items" : ""}`}>
              <span className={`ab-cal-daynum ${sameDay(date, now) ? "is-today" : ""}`}>{date.getDate()}</span>
              <div className="ab-cal-pills">
                {shown.map((it) => (
                  <button key={it.id} type="button" className="ab-cal-pill" style={{ "--pill": it.color }} onClick={it.onClick} title={it.tooltip}>
                    {it.title}
                  </button>
                ))}
                {hidden > 0 && <span className="ab-cal-more">+{hidden}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
