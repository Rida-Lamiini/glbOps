import { STAGES } from "../constants";
import { formatLambert } from "./lambert";
import { Report, loadLogo, fetchImage } from "./reportKit";
import { listCadastreLots, getCadastreLot } from "../components/cadastre/api";

const MAX_PHOTOS = 6;
const REJECT_PREFIXES = ["Non conforme", "Données insuffisantes", "Visite partielle"];
const num = (n, digits = 2) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// The survey attached to this prestation (or, failing that, the latest one of its projet). Any failure
// simply means the PV is issued without the cadastral block.
async function findLot(projet, prestation) {
  try {
    const lots = await listCadastreLots();
    const mine = lots.find((l) => l.prestation === prestation.id) || lots.find((l) => l.projet === projet.id);
    return mine ? await getCadastreLot(mine.id) : null;
  } catch {
    return null;
  }
}

async function loadPhotos(prestation) {
  const photos = (prestation.attachments || []).filter((a) => a.type === "photo" && a.url).slice(0, MAX_PHOTOS);
  const loaded = await Promise.all(
    photos.map(async (a) => {
      const img = await fetchImage(a.url);
      return img ? { ...img, caption: [a.label || a.name, a.date].filter(Boolean).join(" · ") } : null;
    }),
  );
  return { photos: loaded.filter(Boolean), total: (prestation.attachments || []).filter((a) => a.type === "photo").length };
}

const eventKind = (label) => REJECT_PREFIXES.find((p) => label.startsWith(p)) || "";

/**
 * Builds the "procès-verbal" PDF of a prestation: identification, work done, bureau, control,
 * delivery, plus the cadastral lot, field photos and the history of rejections when they exist.
 * Async because the lot and the photos are fetched from the server. Downloads immediately.
 */
export async function generatePvPdf({ projet, client, prestation, materiels, vehicules }) {
  const [logo, lot, photoSet] = await Promise.all([loadLogo(), findLot(projet, prestation), loadPhotos(prestation)]);

  const r = new Report({
    title: `Procès-verbal — ${prestation.natureDemandee || "Prestation"}`,
    eyebrow: "Procès-verbal de prestation",
    subtitle: `${client?.nom || "—"} · ${projet.id} · ${projet.situation || "—"}`,
    ref: `PV N° ${prestation.id}`,
    logo,
  });

  const stageIdx = STAGES.findIndex((s) => s.key === prestation.stage);
  const bureauIdx = STAGES.findIndex((s) => s.key === "bureau");
  const controleIdx = STAGES.findIndex((s) => s.key === "controle");
  const livree = prestation.stage === "livraison" && prestation.chemin && prestation.dateLivraison;

  r.callout(
    livree ? "Prestation livrée" : `Étape en cours : ${STAGES[stageIdx]?.label || prestation.stage}`,
    livree
      ? `Livrée le ${prestation.dateLivraison}${prestation.ref ? ` — référence ${prestation.ref}` : ""}${prestation.cycles ? `, après ${prestation.cycles} reprise${prestation.cycles > 1 ? "s" : ""}` : ""}.`
      : "Ce procès-verbal décrit l'avancement à la date d'édition.",
    livree ? "good" : "info",
  );

  r.section("Identification");
  r.kv([
    ["Client", `${client?.nom || "—"} (${client?.code || "—"})`],
    ["Projet", `${projet.id} — ${projet.naturePrestationProjet || "—"}`],
    ["Référence foncière", projet.referenceFonciere || "—"],
    ["Situation", projet.situation || "—"],
    ...(projet.lat != null && projet.lng != null
      ? [
          ["Coordonnées GPS (WGS84)", `${projet.lat.toFixed(5)}, ${projet.lng.toFixed(5)}`],
          ["Lambert Nord Maroc (EPSG:26191)", formatLambert(projet.lat, projet.lng) || "—"],
        ]
      : []),
  ]);

  r.section("Prestation réalisée");
  const materielNoms = (prestation.materielIds || []).map((id) => materiels?.find((m) => m.id === id)?.nom).filter(Boolean).join(", ");
  const vehiculeNom = vehicules?.find((v) => v.id === prestation.vehiculeId)?.nom;
  r.kv([
    ["Nature demandée", prestation.natureDemandee || "—"],
    ["Nature exécutée", prestation.natureExecutee || "—"],
    ["Agent(s) chantier", (prestation.agentChantier || []).join(", ") || "—"],
    ["Matériel utilisé", materielNoms || "—"],
    ["Véhicule", vehiculeNom || "—"],
    ["Date de visite", prestation.dateDebutExec || "—"],
    ["Fin d'exécution", prestation.dateFinExec || "—"],
  ]);

  // ---- Cadastral lot
  if (lot) {
    const ecart = Math.round((lot.surfaceCalculeeM2 + lot.correctionLambertM2 - lot.surfaceDocumentM2) * 100) / 100;
    const conforme = Math.abs(ecart) <= 1;
    r.section("Lot cadastral", { note: `Titre foncier ${lot.titreFoncier}`, keep: 106 });
    r.kpis([
      { label: "Surface calculée", value: `${num(lot.surfaceCalculeeM2)} m²`, sub: "à partir des bornes" },
      { label: "Surface du document", value: `${num(lot.surfaceDocumentM2)} m²`, sub: "contenance adoptée" },
      { label: "Écart", value: `${ecart > 0 ? "+" : ""}${num(ecart)} m²`, sub: conforme ? "conforme (<= 1 m²)" : "au-delà de 1 m²", tone: conforme ? "good" : "bad" },
    ]);
    const planTop = r.y;
    r.plot(lot.bornes.map((b) => ({ name: b.name, x: b.xLambert, y: b.yLambert })), { w: 92, h: 66 });
    const fx = 16 + 92 + 8;
    [
      ["Propriété dite", lot.proprieteDite],
      ["Géomètre", lot.geometre || "—"],
      ["Revue", { brouillon: "Brouillon", verifie: "Vérifié", valide: "Validé" }[lot.statut] || lot.statut],
    ].forEach(([label, value], i) => {
      const fy = planTop + 5 + i * 20;
      r.font("bold", 7, [109, 102, 90]);
      r.text(label.toUpperCase(), fx, fy);
      r.font("normal", 10, [29, 27, 24]);
      r.doc.text(r.lines(value, 210 - 16 - fx), fx, fy + 5.5);
    });
    r.y = planTop + 72;
    r.paragraph("Rapport cadastral complet disponible dans l'outil Cadastre (bornes, distances, revue).", { size: 8, color: [109, 102, 90], gap: 2 });
  }

  // ---- Photos
  if (photoSet.photos.length) {
    r.section("Photos de terrain", { note: photoSet.total > photoSet.photos.length ? `${photoSet.photos.length} sur ${photoSet.total}` : `${photoSet.photos.length} photo${photoSet.photos.length > 1 ? "s" : ""}` });
    r.photoGrid(photoSet.photos);
  }

  if (stageIdx > bureauIdx || prestation.stage === "bureau") {
    r.section("Traitement bureau");
    r.kv([
      ["Tâches réalisées", (prestation.taches || []).map((t) => `${t.label} (${(t.agents || []).join(", ") || "—"})`).join(" · ") || "—"],
      ["Référence du livrable", prestation.ref || "—"],
      ["Début du traitement", prestation.dateDebutBureau || "—"],
      ["Fin du traitement", prestation.dateFinBureau || "—"],
      ["Dossier de travail", prestation.cheminBureau || "—"],
    ]);
  }

  // ---- Rejections and re-work
  const events = (prestation.history || []).filter((h) => eventKind(h.label || ""));
  if (events.length) {
    r.section("Historique des reprises", { note: `${events.length} événement${events.length > 1 ? "s" : ""}` });
    r.table({
      cols: [
        { label: "Date", w: 2 },
        { label: "Événement", w: 3.2 },
        { label: "Détail", w: 8 },
        { label: "Par", w: 2.4 },
      ],
      rows: events.map((h) => {
        const kind = eventKind(h.label);
        return [h.date, { text: kind, bold: true, tone: kind === "Visite partielle" ? "warn" : "bad" }, h.label.slice(kind.length).replace(/^[\s—-]+/, "") || "—", h.author || "—"];
      }),
    });
  }

  if (stageIdx > controleIdx || prestation.stage === "controle") {
    r.section("Contrôle");
    r.kv([
      ["Agent contrôle", prestation.agentControle || "—"],
      ["Période de contrôle", `Du ${prestation.dateDebutControle || "—"} au ${prestation.dateFinControle || "—"}`],
      ["Résultat", prestation.cycles > 0 ? `Conforme après ${prestation.cycles} reprise${prestation.cycles > 1 ? "s" : ""}` : "Conforme"],
    ]);
  }

  if (livree) {
    r.section("Livraison");
    r.kv([
      ["Date de livraison", prestation.dateLivraison],
      ["Référence du livrable", prestation.ref || "—"],
      ["Dossier de livraison", prestation.chemin || "—"],
      ["CD / Disque", [prestation.cdN, prestation.disqueN].filter(Boolean).join(" / ") || "—"],
    ]);
  }

  r.section("Signatures");
  r.signatures([
    { role: "Agent chantier", name: (prestation.agentChantier || [])[0] },
    { role: "Responsable Globetudes" },
    { role: "Client (lu et approuvé)", name: client?.contact },
  ]);

  r.finalize(`PV-${prestation.id}.pdf`);
}
