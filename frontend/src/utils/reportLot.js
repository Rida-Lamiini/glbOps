import { Report, loadLogo } from "./reportKit";
import { formatDateFR } from "./dates";

const STATUT_LABEL = { brouillon: "Brouillon", verifie: "Vérifié", valide: "Validé" };
const SURFACE_TOLERANCE_M2 = 1;
const DISTANCE_TOLERANCE_M = 0.1;

const m2 = (n) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const num = (n, digits = 2) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtDate = (iso) => (iso ? formatDateFR(new Date(iso)) : "");

// Closed-ring perimeter from Lambert coordinates (metres).
function perimeter(bornes) {
  return bornes.reduce((sum, b, i) => {
    const n = bornes[(i + 1) % bornes.length];
    return sum + Math.hypot(n.xLambert - b.xLambert, n.yLambert - b.yLambert);
  }, 0);
}

/**
 * Cadastral report for one saved lot: identification, surface check, plan, bornes, distance
 * control and the review trail. `lot` is the detailed lot from getCadastreLot; projet / client /
 * prestation are optional context.
 */
export async function generateLotReport({ lot, projet, client, prestation }) {
  const logo = await loadLogo();
  const ecart = Math.round((lot.surfaceCalculeeM2 + lot.correctionLambertM2 - lot.surfaceDocumentM2) * 100) / 100;
  const conforme = Math.abs(ecart) <= SURFACE_TOLERANCE_M2;
  const r = new Report({
    title: lot.proprieteDite || "Lot cadastral",
    eyebrow: `Rapport cadastral · Titre foncier ${lot.titreFoncier}`,
    subtitle: "Contrôle de la surface, des bornes et des distances d'un lot issu d'un Calcul de Contenances.",
    ref: `Lot ${lot.titreFoncier}${lot.lotNumber ? ` / ${lot.lotNumber}` : ""}`,
    logo,
  });

  r.callout(
    conforme ? "Lot conforme" : "Écart de surface à examiner",
    conforme
      ? `La surface recalculée à partir des bornes concorde avec le document (écart de ${num(ecart)} m², tolérance ${SURFACE_TOLERANCE_M2} m²).`
      : `L'écart entre la surface recalculée et le document est de ${num(ecart)} m², au-delà de la tolérance de ${SURFACE_TOLERANCE_M2} m².`,
    conforme ? "good" : "bad",
  );

  r.kpis([
    { label: "Surface calculée", value: m2(lot.surfaceCalculeeM2), sub: "à partir des bornes" },
    { label: "Surface du document", value: m2(lot.surfaceDocumentM2), sub: "contenance adoptée" },
    { label: "Correction Lambert", value: m2(lot.correctionLambertM2), sub: "altération linéaire" },
    { label: "Écart", value: `${ecart > 0 ? "+" : ""}${num(ecart)} m²`, sub: `tolérance ${SURFACE_TOLERANCE_M2} m²`, tone: conforme ? "good" : "bad" },
  ]);

  r.section("Identification");
  r.kv([
    ["Titre foncier", lot.titreFoncier],
    ["Propriété dite", lot.proprieteDite],
    ["Lot n°", lot.lotNumber],
    ["Référence d'affaire", lot.affaireRef],
    ["Géomètre", lot.geometre],
    ["Date du levé", fmtDate(lot.dateLeve)],
    ["Service du cadastre", lot.serviceCadastre],
    ["Client", client ? `${client.nom} (${client.code || client.id})` : ""],
    ["Projet", projet ? `${projet.id}${projet.situation ? ` — ${projet.situation}` : ""}` : ""],
    ["Prestation", prestation ? `${prestation.id} — ${prestation.natureDemandee || ""}` : ""],
  ]);

  // Plan next to the key facts.
  r.section("Plan du lot", { note: "Coordonnées Lambert Nord Maroc (EPSG:26191)", keep: 82 });
  const points = lot.bornes.map((b) => ({ name: b.name, x: b.xLambert, y: b.yLambert }));
  const planTop = r.y;
  r.plot(points, { w: 100, h: 80 });
  const fx = 16 + 100 + 8;
  const perim = lot.bornes.length >= 3 ? perimeter(lot.bornes) : 0;
  const facts = [
    ["Bornes", String(lot.bornes.length)],
    ["Périmètre", lot.bornes.length >= 3 ? `${num(perim)} m` : "—"],
    ["Statut de revue", STATUT_LABEL[lot.statut] || lot.statut],
  ];
  facts.forEach(([label, value], i) => {
    const fy = planTop + 6 + i * 22;
    r.font("bold", 7, [109, 102, 90]);
    r.text(label.toUpperCase(), fx, fy);
    r.font("bold", 16, [29, 27, 24], "times");
    r.text(value, fx, fy + 8);
  });
  r.y = planTop + 86;

  r.section("Bornes");
  r.table({
    cols: [
      { label: "Borne", w: 3 },
      { label: "X Lambert (m)", w: 4, align: "right" },
      { label: "Y Lambert (m)", w: 4, align: "right" },
      { label: "Latitude", w: 3.4, align: "right" },
      { label: "Longitude", w: 3.4, align: "right" },
    ],
    rows: lot.bornes.map((b) => [{ text: b.name, bold: true }, num(b.xLambert, 3), num(b.yLambert, 3), b.lat.toFixed(6), b.lng.toFixed(6)]),
    emptyText: "Aucune borne enregistrée.",
  });

  if (lot.distanceChecks.length) {
    r.section("Contrôle des distances", { note: `tolérance ${DISTANCE_TOLERANCE_M} m` });
    r.table({
      cols: [
        { label: "Segment", w: 4 },
        { label: "Croquis (m)", w: 3, align: "right" },
        { label: "Calculée (m)", w: 3, align: "right" },
        { label: "Écart (m)", w: 3, align: "right" },
        { label: "Résultat", w: 2.6 },
      ],
      rows: lot.distanceChecks.map((d) => {
        const ok = Math.abs(d.ecartM) <= DISTANCE_TOLERANCE_M;
        return [d.segmentLabel, num(d.croquisM, 3), num(d.calculeM, 3), `${d.ecartM > 0 ? "+" : ""}${num(d.ecartM, 3)}`, { text: ok ? "Conforme" : "À vérifier", tone: ok ? "good" : "bad", bold: true }];
      }),
    });
  }

  if (lot.referencePoints.length) {
    r.section("Points de repère");
    r.table({
      cols: [
        { label: "Repère", w: 5 },
        { label: "Distance (m)", w: 3, align: "right" },
        { label: "Gisement (°)", w: 3, align: "right" },
      ],
      rows: lot.referencePoints.map((p) => [p.label, num(p.distanceM, 1), num(p.bearingDeg, 1)]),
    });
  }

  r.section("Revue et validation");
  r.kv([
    ["Établi par", lot.createdByName || "—"],
    ["Statut actuel", STATUT_LABEL[lot.statut] || lot.statut],
    ["Dernière décision", lot.statut !== "brouillon" ? `${STATUT_LABEL[lot.statut]} par ${lot.statutParName || "—"}${lot.statutAt ? ` le ${fmtDate(lot.statutAt)}` : ""}` : "En attente de vérification"],
    ["Dernière modification", fmtDate(lot.updatedAt)],
  ]);
  r.paragraph("La surface est toujours recalculée par la plateforme à partir des bornes saisies ; elle n'est jamais reprise telle quelle du document. Toute modification du lot le remet à l'état de brouillon.", { size: 8.3, color: [109, 102, 90], gap: 5 });
  r.signatures([
    { role: "Établi par (bureau)", name: lot.createdByName },
    { role: "Vérifié par", name: lot.statut !== "brouillon" ? lot.statutParName : "" },
    { role: "Validé par (contrôle)", name: lot.statut === "valide" ? lot.statutParName : "" },
  ]);

  r.finalize(`Rapport-cadastral-${String(lot.titreFoncier).replace(/[^\w-]+/g, "_")}.pdf`);
}
