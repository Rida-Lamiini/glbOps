import React from "react";
import { Clock } from "lucide-react";
import { DatePicker } from "./date-picker";
import { today, nowTime, splitDateTimeFR } from "../../utils/dates";

// Combines the existing DatePicker with a native time input into one "DD/MM/YYYY HH:MM"
// string, so callers keep storing a single field (same contract as the old date-only value)
// instead of splitting date/time across two prestation fields.
export function DateTimeField({ value, onChange, className, todayLabel = "Aujourd'hui" }) {
  const { datePart, timePart } = splitDateTimeFR(value);

  const setDate = (d) => onChange(d ? `${d}${timePart ? ` ${timePart}` : ""}` : "");
  const setTime = (t) => onChange(`${datePart || today()} ${t}`);
  const setNow = () => onChange(`${today()} ${nowTime()}`);

  return (
    <div className="gt-datetimefield">
      <DatePicker value={datePart} onChange={setDate} className={className} />
      <div className="gt-timeinput-wrap">
        <Clock size={13} className="gt-timeinput-icon" />
        <input type="time" className="gt-timeinput" value={timePart} onChange={(e) => setTime(e.target.value)} />
      </div>
      <button type="button" className="gt-todaybtn" onClick={setNow}>
        {todayLabel}
      </button>
    </div>
  );
}
