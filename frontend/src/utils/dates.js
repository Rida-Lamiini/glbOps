export const today = () =>
  new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const nowTime = () =>
  new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });

// Accepts a plain "DD/MM/YYYY" date or a "DD/MM/YYYY HH:MM" datetime — the trailing time (if
// any) is ignored for date-level comparisons/sorting, which is what every caller wants.
export const parseDateFR = (s) => {
  if (!s) return null;
  const [datePart] = s.trim().split(" ");
  const [d, m, y] = datePart.split("/").map(Number);
  if (!d || !m || !y) return null;
  const t = new Date(y, m - 1, d).getTime();
  return Number.isNaN(t) ? null : t;
};

export const parseDateFRToDate = (s) => {
  const t = parseDateFR(s);
  return t == null ? undefined : new Date(t);
};

// Inverse of isoToFR: "DD/MM/YYYY" -> "YYYY-MM-DD" (what DRF DateField expects). Empty in, null out.
export const frToISO = (fr) => {
  if (!fr) return null;
  const [d, m, y] = fr.trim().split(" ")[0].split("/");
  return d && m && y ? `${y}-${m}-${d}` : null;
};

// Converts a "YYYY-MM-DD" date (the format DRF serializes DateField as) to "DD/MM/YYYY",
// the format used throughout the frontend. Returns "" for empty/null input.
export const isoToFR = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const formatDateFR = (date) =>
  date ? date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

export const formatTimestamp = (t) =>
  t == null ? null : new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const formatFileSize = (bytes) => {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

export const fileExt = (name) => (name.includes(".") ? name.split(".").pop().toUpperCase().slice(0, 4) : "FILE");

export const nowMs = () => Date.now();

export const isPastDue = (dateFR) => {
  const t = parseDateFR(dateFR);
  return t != null && t < Date.now();
};

export const isDateWithinRange = (dateFR, startFR, endFR) => {
  const t = parseDateFR(dateFR);
  const start = parseDateFR(startFR);
  const end = parseDateFR(endFR);
  if (t == null || start == null || end == null) return false;
  return t >= start && t <= end;
};

export const activeCongeOn = (conges, dateFR) =>
  (conges || []).find((c) => c.statut === "approuve" && isDateWithinRange(dateFR, c.dateDebut, c.dateFin)) || null;

export const splitDateTimeFR = (s) => {
  const [datePart = "", timePart = ""] = (s || "").trim().split(" ");
  return { datePart, timePart };
};

// Next business day (Mon–Fri) after `dateFR`, falling back to tomorrow if `dateFR` can't be
// parsed. Used only as a starting suggestion — never auto-committed.
export const nextBusinessDayFR = (dateFR) => {
  const base = parseDateFR(dateFR) ?? Date.now();
  const d = new Date(base);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return formatDateFR(d);
};
