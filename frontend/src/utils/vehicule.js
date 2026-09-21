import { parseDateFR } from "./dates";

const DAY = 86400000;
// A paper is "soon" when it expires within this many days; a service is "soon" within this many km.
export const PAPER_SOON_DAYS = 30;
export const SERVICE_SOON_KM = 1500;

export const CARBURANTS = [
  { key: "diesel", label: "Diesel" },
  { key: "essence", label: "Essence" },
  { key: "hybride", label: "Hybride" },
  { key: "electrique", label: "Électrique" },
];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Where a due date stands. `from` (optional) is when the validity period started, so the gauge can
// show how much of it is used up — the same idea as the equipment calibration bar.
function dueStatus(key, label, due, from) {
  const end = parseDateFR(due);
  if (end == null) return { key, label, due: "", level: "none", days: null, text: "Non renseigné", elapsed: 0 };
  const days = Math.round((end - startOfToday()) / DAY);
  const start = parseDateFR(from);
  const span = start != null && end > start ? end - start : null;
  const elapsed = span ? Math.min(1, Math.max(0, (startOfToday() - start) / span)) : days < 0 ? 1 : 0.5;
  const level = days < 0 ? "late" : days <= PAPER_SOON_DAYS ? "soon" : "ok";
  const text = days < 0 ? `expirée depuis ${-days} j` : days === 0 ? "expire aujourd'hui" : `dans ${days} j`;
  return { key, label, due, level, days, text, elapsed };
}

// Mileage-based service state, alongside the date-based one.
function serviceStatus(item) {
  const byDate = dueStatus("entretien", "Entretien", item.entretienProchainDate, item.kilometrageDate);
  const km = Number(item.kilometrage);
  const limit = Number(item.entretienProchainKm);
  const hasKm = Number.isFinite(km) && km >= 0 && Number.isFinite(limit) && limit > 0 && item.kilometrage !== "" && item.entretienProchainKm !== "";
  if (!hasKm) return { ...byDate, kmLeft: null };
  const kmLeft = limit - km;
  const kmLevel = kmLeft < 0 ? "late" : kmLeft <= SERVICE_SOON_KM ? "soon" : "ok";
  const rank = { none: -1, ok: 0, soon: 1, late: 2 };
  const kmText = kmLeft < 0 ? `dépassé de ${(-kmLeft).toLocaleString("fr-FR")} km` : `dans ${kmLeft.toLocaleString("fr-FR")} km`;
  // Whichever of the two (date, mileage) is more urgent decides the level and the wording.
  const kmDrives = byDate.level === "none" || rank[kmLevel] > rank[byDate.level];
  const level = kmDrives ? kmLevel : byDate.level;
  const text = kmDrives ? kmText : byDate.text;
  return { ...byDate, level, kmLeft, kmText, text, elapsed: Math.max(byDate.elapsed, limit > 0 ? Math.min(1, km / limit) : 0) };
}

// The four things the office has to keep valid on a vehicle.
export function vehiculePapers(item) {
  return [
    dueStatus("assurance", "Assurance", item.assuranceEcheance, item.assuranceDebut),
    dueStatus("visite", "Visite technique", item.visiteTechniqueProchaine, item.visiteTechniqueDerniere),
    dueStatus("vignette", "Vignette", item.vignetteEcheance, item.vignettePaiement),
    serviceStatus(item),
  ];
}

const RANK = { late: 2, soon: 1, ok: 0, none: -1 };

// Papers that need action (expired or expiring), most urgent first.
export function vehiculeAlerts(item) {
  if (item.type !== "vehicule") return [];
  return vehiculePapers(item)
    .filter((p) => p.level === "late" || p.level === "soon")
    .sort((a, b) => RANK[b.level] - RANK[a.level] || (a.days ?? 0) - (b.days ?? 0));
}

export const vehiculeWorstLevel = (item) => {
  const levels = vehiculePapers(item).map((p) => p.level);
  return levels.reduce((worst, l) => (RANK[l] > RANK[worst] ? l : worst), "none");
};

// Documents that would make it unwise to send the vehicle out (expired insurance or inspection).
export function vehiculeBlockers(item) {
  if (!item || item.type !== "vehicule") return [];
  return vehiculePapers(item).filter((p) => (p.key === "assurance" || p.key === "visite") && p.level === "late");
}
