import { Report, loadLogo, COLORS } from "./reportKit";
import { STAGES } from "../constants";
import { parseDateFR, isPastDue } from "./dates";
import { computeEmployeeStats } from "./stats";
import { vehiculeAlerts } from "./vehicule";

const DAY = 86400000;
const STAGE_RGB = {
  demande: [109, 102, 90],
  prestation: [59, 110, 165],
  affectation: [179, 38, 30],
  execution: [183, 121, 31],
  bureau: [31, 111, 104],
  controle: [122, 90, 156],
  livraison: [31, 122, 85],
};
const REJECT = ["Non conforme", "Données insuffisantes"];

const monthBounds = (key) => {
  const [y, m] = key.split("-").map(Number);
  return { start: new Date(y, m - 1, 1).getTime(), end: new Date(y, m, 0, 23, 59, 59, 999).getTime(), y, m };
};
export const monthLabelFR = (key) => {
  const { y, m } = monthBounds(key);
  const label = new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const shortMonth = (y, m) => new Date(y, m, 1).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
const inMonth = (dateFR, b) => {
  const t = parseDateFR(dateFR);
  return t != null && t >= b.start && t <= b.end;
};
const isLivree = (p) => p.stage === "livraison" && Boolean(p.chemin);
const delta = (cur, prev) => (cur === prev ? "stable vs mois précédent" : `${cur > prev ? "+" : ""}${cur - prev} vs mois précédent`);

/** Months (YYYY-MM) offered in the selector: the current month and the five before it. */
export function reportMonths(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Monthly management report. Activity figures (requests, deliveries, rejections) are for the chosen
 * month; the pipeline, workload, resources and cadastre blocks are the situation on the day it is issued.
 */
export async function generateMonthlyReport({ monthKey, projets, employees, materiels, vehicules, lots, getClient, author }) {
  const logo = await loadLogo();
  const b = monthBounds(monthKey);
  const prevKey = b.m === 1 ? `${b.y - 1}-12` : `${b.y}-${String(b.m - 1).padStart(2, "0")}`;
  const prevB = monthBounds(prevKey);

  const all = projets.flatMap((pr) => pr.prestations.map((p) => ({ ...p, projet: pr })));
  const clientName = (p) => getClient(p.projet.clientId)?.nom || p.projet.id;

  const recues = all.filter((p) => inMonth(p.dateDebutDemande, b));
  const recuesPrev = all.filter((p) => inMonth(p.dateDebutDemande, prevB));
  const livrees = all.filter((p) => isLivree(p) && inMonth(p.dateLivraison, b));
  const livreesPrev = all.filter((p) => isLivree(p) && inMonth(p.dateLivraison, prevB));
  const delays = livrees
    .map((p) => (parseDateFR(p.dateLivraison) - parseDateFR(p.dateDebutDemande)) / DAY)
    .filter((n) => Number.isFinite(n) && n >= 0);
  const delaiMoyen = delays.length ? Math.round(delays.reduce((a, c) => a + c, 0) / delays.length) : null;

  const rejections = all.flatMap((p) =>
    (p.history || [])
      .filter((h) => REJECT.some((r) => (h.label || "").startsWith(r)) && inMonth(h.date, b))
      .map((h) => ({ p, h })),
  );
  const open = all.filter((p) => !isLivree(p));
  const nonConfOpen = open.filter((p) => p.cycles > 0);
  const enRetard = open.filter((p) => p.stage === "affectation" && (parseDateFR(p.dateDebutExec) ?? Infinity) < Date.now());

  const r = new Report({
    title: `Rapport de direction — ${monthLabelFR(monthKey)}`,
    eyebrow: "Rapport mensuel",
    subtitle: "Activité du mois, qualité, charge des équipes et état des ressources.",
    ref: monthLabelFR(monthKey),
    logo,
  });

  // ---- Synthèse
  r.kpis([
    { label: "Demandes reçues", value: String(recues.length), sub: delta(recues.length, recuesPrev.length) },
    { label: "Prestations livrées", value: String(livrees.length), sub: delta(livrees.length, livreesPrev.length), tone: "good" },
    { label: "Non-conformités", value: String(rejections.length), sub: "renvois du mois", tone: rejections.length ? "bad" : undefined },
    { label: "Délai moyen", value: delaiMoyen == null ? "—" : `${delaiMoyen} j`, sub: "demande à livraison" },
  ]);

  const points = [];
  if (enRetard.length) points.push(`${enRetard.length} visite${enRetard.length > 1 ? "s" : ""} terrain prévue${enRetard.length > 1 ? "s" : ""} et non démarrée${enRetard.length > 1 ? "s" : ""} (${enRetard.map((p) => p.id).join(", ")}).`);
  if (nonConfOpen.length) points.push(`${nonConfOpen.length} prestation${nonConfOpen.length > 1 ? "s" : ""} en reprise après non-conformité (${nonConfOpen.map((p) => p.id).join(", ")}).`);
  const stuck = open.filter((p) => p.stage === "controle").length;
  if (stuck) points.push(`${stuck} dossier${stuck > 1 ? "s" : ""} en attente de contrôle.`);
  const fleetLate = vehicules.filter((v) => vehiculeAlerts(v).some((a) => a.level === "late"));
  if (fleetLate.length) points.push(`${fleetLate.length} véhicule${fleetLate.length > 1 ? "s" : ""} avec un papier expiré (${fleetLate.map((v) => v.nom).join(", ")}).`);
  const calLate = materiels.filter((m) => isPastDue(m.prochaineCalibration));
  if (calLate.length) points.push(`${calLate.length} matériel${calLate.length > 1 ? "s" : ""} avec un étalonnage en retard (${calLate.map((m) => m.nom).join(", ")}).`);

  if (points.length) {
    r.callout("Points d'attention", points.map((p) => `• ${p}`).join("\n"), "warn");
  } else {
    r.callout("Rien à signaler", "Aucun retard, aucune reprise en cours et aucun papier expiré à la date d'édition.", "good");
  }

  // ---- Activité sur 6 mois
  r.section("Activité sur six mois", { keep: 44 });
  const series = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(b.y, b.m - 1 - (5 - i), 1);
    const bb = { start: d.getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime() };
    return {
      label: shortMonth(d.getFullYear(), d.getMonth()),
      a: all.filter((p) => inMonth(p.dateDebutDemande, bb)).length,
      b: all.filter((p) => isLivree(p) && inMonth(p.dateLivraison, bb)).length,
    };
  });
  r.columns(series, { aLabel: "Demandes reçues", bLabel: "Livraisons" });

  // ---- Livraisons du mois
  r.section("Prestations livrées ce mois", { note: `${livrees.length} livraison${livrees.length > 1 ? "s" : ""}` });
  r.table({
    cols: [
      { label: "Prestation", w: 2.6 },
      { label: "Client", w: 3.6 },
      { label: "Nature", w: 5 },
      { label: "Livrée le", w: 2.4 },
      { label: "Délai", w: 1.6, align: "right" },
      { label: "Reprises", w: 1.7, align: "right" },
    ],
    rows: livrees.map((p) => {
      const d = Math.round((parseDateFR(p.dateLivraison) - parseDateFR(p.dateDebutDemande)) / DAY);
      return [{ text: p.id, bold: true }, clientName(p), p.natureDemandee || "—", p.dateLivraison, Number.isFinite(d) ? `${d} j` : "—", { text: String(p.cycles || 0), tone: p.cycles ? "bad" : undefined }];
    }),
    emptyText: "Aucune prestation livrée ce mois-ci.",
  });

  // ---- Qualité
  r.section("Qualité : renvois du mois", { note: `${rejections.length} événement${rejections.length > 1 ? "s" : ""}` });
  r.table({
    cols: [
      { label: "Date", w: 2 },
      { label: "Prestation", w: 2.6 },
      { label: "Client", w: 3 },
      { label: "Motif", w: 7 },
      { label: "Par", w: 2.4 },
    ],
    rows: rejections.map(({ p, h }) => [h.date, { text: p.id, bold: true }, clientName(p), h.label.replace(/^(Non conforme|Données insuffisantes) — /, "$1 — "), h.author || "—"]),
    emptyText: "Aucun renvoi ce mois-ci.",
  });

  // ---- Situation à la date d'édition
  r.section("Situation des prestations en cours", { note: "à la date d'édition", keep: 6 * STAGES.length + 3 });
  r.bars(
    STAGES.map((s) => ({ label: s.label, value: open.filter((p) => p.stage === s.key).length, color: STAGE_RGB[s.key] })),
    { labelW: 48 },
  );

  r.section("Charge de travail par agent", { note: "prestations non livrées" });
  const workload = employees
    .filter((e) => (e.status || "actif") === "actif")
    .map((e) => {
      const { assignments } = computeEmployeeStats(e, projets);
      const openAssign = assignments.filter(({ prestation }) => !isLivree(prestation));
      return { e, total: openAssign.length, nonConf: openAssign.filter(({ prestation }) => prestation.cycles > 0).length };
    })
    .filter((w) => w.total > 0)
    .sort((a, c) => c.total - a.total);
  r.table({
    cols: [
      { label: "Agent", w: 4 },
      { label: "Poste", w: 4 },
      { label: "En cours", w: 2, align: "right" },
      { label: "Dont reprises", w: 2.4, align: "right" },
    ],
    rows: workload.map((w) => [{ text: w.e.nom, bold: true }, w.e.poste || w.e.role, String(w.total), { text: String(w.nonConf), tone: w.nonConf ? "bad" : undefined }]),
    emptyText: "Aucune charge active.",
  });

  // ---- Ressources
  r.section("Ressources à surveiller");
  const resRows = [];
  materiels.forEach((m) => {
    if ((m.status || "operationnel") !== "operationnel") resRows.push([{ text: m.nom, bold: true }, "Matériel", "Statut", { text: m.status === "hors_service" ? "Hors service" : "En maintenance", tone: "warn" }]);
    if (isPastDue(m.prochaineCalibration)) resRows.push([{ text: m.nom, bold: true }, "Matériel", "Étalonnage", { text: `en retard (échéance ${m.prochaineCalibration})`, tone: "bad" }]);
  });
  vehicules.forEach((v) => {
    if ((v.status || "operationnel") !== "operationnel") resRows.push([{ text: v.nom, bold: true }, "Véhicule", "Statut", { text: v.status === "hors_service" ? "Hors service" : "En maintenance", tone: "warn" }]);
    vehiculeAlerts(v).forEach((a) => resRows.push([{ text: v.nom, bold: true }, "Véhicule", a.label, { text: `${a.level === "late" ? "expiré" : "à renouveler"} — ${a.due ? `échéance ${a.due}` : a.text}`, tone: a.level === "late" ? "bad" : "warn" }]));
  });
  r.table({
    cols: [
      { label: "Ressource", w: 4.6 },
      { label: "Type", w: 2 },
      { label: "Point de contrôle", w: 3 },
      { label: "État", w: 6 },
    ],
    rows: resRows,
    emptyText: "Toutes les ressources sont opérationnelles et à jour.",
  });

  // ---- Congés
  const congeRows = [];
  employees.forEach((e) =>
    (e.conges || []).forEach((c) => {
      const s = parseDateFR(c.dateDebut), f = parseDateFR(c.dateFin);
      if (s != null && f != null && s <= b.end && f >= b.start && c.statut !== "refuse") congeRows.push({ e, c });
    }),
  );
  r.section("Congés du mois");
  if (congeRows.length === 0) {
    r.paragraph("Aucun congé sur la période.", { size: 9, color: COLORS.muted, gap: 1 });
  } else if (congeRows.length <= 3) {
    // A couple of leaves read better as a short list than as a table.
    congeRows.forEach(({ e, c }) => {
      r.paragraph(`• ${e.nom} — ${c.type}, du ${c.dateDebut} au ${c.dateFin} (${c.statut === "approuve" ? "approuvé" : "en attente"})`, { size: 9, gap: 0.5 });
    });
  } else {
    r.table({
      cols: [
        { label: "Employé", w: 4 },
        { label: "Type", w: 3 },
        { label: "Du", w: 2.4 },
        { label: "Au", w: 2.4 },
        { label: "Statut", w: 2.4 },
      ],
      rows: congeRows.map(({ e, c }) => [{ text: e.nom, bold: true }, c.type, c.dateDebut, c.dateFin, { text: c.statut === "approuve" ? "Approuvé" : "En attente", tone: c.statut === "approuve" ? "good" : "warn" }]),
    });
  }

  // ---- Cadastre
  r.section("Cadastre", { keep: 28 });
  const lotList = lots || [];
  const conformes = lotList.filter((l) => l.conforme).length;
  const byStatut = (s) => lotList.filter((l) => l.statut === s).length;
  const touched = lotList.filter((l) => l.updatedAt && new Date(l.updatedAt).getTime() >= b.start && new Date(l.updatedAt).getTime() <= b.end).length;
  r.kpis([
    { label: "Lots enregistrés", value: String(lotList.length), sub: `${touched} créé${touched > 1 ? "s" : ""} ou modifié${touched > 1 ? "s" : ""} ce mois` },
    { label: "Conformes", value: String(conformes), sub: "écart de surface <= 1 m²", tone: "good" },
    { label: "Avec écart", value: String(lotList.length - conformes), sub: "à examiner", tone: lotList.length - conformes ? "bad" : undefined },
    { label: "Validés", value: String(byStatut("valide")), sub: `${byStatut("verifie")} vérifié(s), ${byStatut("brouillon")} brouillon(s)` },
  ]);

  r.paragraph(`Établi par ${author || "glbOps"}. Activité : ${monthLabelFR(monthKey).toLowerCase()}. Autres blocs : état au jour de l'édition.`, { size: 8, color: COLORS.muted, gap: 0 });

  r.finalize(`Rapport-direction-${monthKey}.pdf`);
}
