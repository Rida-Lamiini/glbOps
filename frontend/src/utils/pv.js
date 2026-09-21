import { jsPDF } from "jspdf";
import { STAGES } from "../constants";
import { today } from "./dates";
import { formatLambert } from "./lambert";

const MARGIN = 18;
const LINE_H = 4.6;
const FIELD_GAP = 4;

const hline = (doc, y, pageW) => {
  doc.setDrawColor(210, 208, 196);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageW - MARGIN, y);
};

const sectionTitle = (doc, label, y) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(20, 24, 31);
  doc.text(label.toUpperCase(), MARGIN, y);
  return y + 6;
};

// Draws one label/value pair, wrapping the value to colWidth (base14 fonts have no "→" glyph,
// so callers pass plain-ASCII-safe separators). Returns the total height consumed.
const field = (doc, x, y, colWidth, label, value) => {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 111, 102);
  doc.text(label.toUpperCase(), x, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(20, 24, 31);
  const lines = doc.splitTextToSize(String(value ?? "—") || "—", colWidth);
  doc.text(lines, x, y + 5);

  return 5 + lines.length * LINE_H + FIELD_GAP;
};

// Draws two label/value columns side by side, each stacked independently, wrapping long values
// to the column width, and returns the y position just past whichever column ran taller — so a
// divider drawn right after never cuts through the longer column.
const twoColumns = (doc, y, pageW, leftFields, rightFields) => {
  const colWidth = (pageW - 2 * MARGIN) / 2 - 8;
  const midX = MARGIN + (pageW - 2 * MARGIN) / 2;

  let leftY = y;
  leftFields.forEach(([label, value]) => { leftY += field(doc, MARGIN, leftY, colWidth, label, value); });

  let rightY = y;
  rightFields.forEach(([label, value]) => { rightY += field(doc, midX, rightY, colWidth, label, value); });

  return Math.max(leftY, rightY);
};

/**
 * Builds a "procès-verbal" PDF for a prestation — pulls client/projet/prestation data into a
 * formatted, signable document instead of requiring a manual write-up. Downloads immediately;
 * returns nothing (mirrors the other export* helpers in utils/geo.js).
 */
export function generatePvPdf({ projet, client, prestation, materiels, vehicules }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 24, 31);
  doc.text("GLOBÉTUDES", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 111, 102);
  doc.text("Prestations topographiques", MARGIN, y + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(163, 39, 29);
  doc.text(`PV N° ${prestation.id}`, pageW - MARGIN, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 111, 102);
  doc.text(`Émis le ${today()}`, pageW - MARGIN, y + 5, { align: "right" });

  y += 12;
  hline(doc, y, pageW);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 24, 31);
  doc.text(`PROCÈS-VERBAL — ${(prestation.natureDemandee || "Prestation").toUpperCase()}`, MARGIN, y);
  y += 12;

  // Identification
  y = sectionTitle(doc, "Identification", y);
  y = twoColumns(
    doc,
    y,
    pageW,
    [
      ["Client", `${client?.nom || "—"} (${client?.code || "—"})`],
      ["Projet", `${projet.id} — ${projet.naturePrestationProjet || "—"}`],
      ["Référence foncière", projet.referenceFonciere || "—"],
      ["Situation", projet.situation || "—"],
    ],
    projet.lat != null && projet.lng != null
      ? [
          ["Coordonnées GPS (WGS84)", `${projet.lat.toFixed(5)}, ${projet.lng.toFixed(5)}`],
          ["Lambert Nord Maroc (EPSG:26191)", formatLambert(projet.lat, projet.lng) || "—"],
        ]
      : []
  );
  y += 4;
  hline(doc, y, pageW);
  y += 10;

  // Prestation
  y = sectionTitle(doc, "Prestation réalisée", y);
  const materielNoms = (prestation.materielIds || [])
    .map((id) => materiels?.find((m) => m.id === id)?.nom)
    .filter(Boolean)
    .join(", ");
  const vehiculeNom = vehicules?.find((v) => v.id === prestation.vehiculeId)?.nom;
  y = twoColumns(
    doc,
    y,
    pageW,
    [
      ["Nature demandée", prestation.natureDemandee || "—"],
      ["Nature exécutée", prestation.natureExecutee || "—"],
      ["Matériel utilisé", materielNoms || "—"],
      ["Véhicule", vehiculeNom || "—"],
    ],
    [
      ["Agent(s) chantier", (prestation.agentChantier || []).join(", ") || "—"],
      ["Date de visite", prestation.dateDebutExec || "—"],
      ["Date de fin d'exécution", prestation.dateFinExec || "—"],
    ]
  );
  y += 4;
  hline(doc, y, pageW);
  y += 10;

  const stageIdx = STAGES.findIndex((s) => s.key === prestation.stage);
  const bureauIdx = STAGES.findIndex((s) => s.key === "bureau");
  const controleIdx = STAGES.findIndex((s) => s.key === "controle");

  // Traitement bureau
  if (stageIdx > bureauIdx || prestation.stage === "bureau") {
    y = sectionTitle(doc, "Traitement bureau", y);
    y = twoColumns(
      doc,
      y,
      pageW,
      [
        ["Tâches réalisées", (prestation.taches || []).map((t) => `${t.label} (${(t.agents || []).join(", ") || "—"})`).join(" · ") || "—"],
        ["Référence du livrable", prestation.ref || "—"],
        ["Chemin du dossier", prestation.cheminBureau || "—"],
      ],
      [
        ["Date début traitement", prestation.dateDebutBureau || "—"],
        ["Date fin traitement", prestation.dateFinBureau || "—"],
      ]
    );
    y += 4;
    hline(doc, y, pageW);
    y += 10;
  }

  // Contrôle
  if (stageIdx > controleIdx || prestation.stage === "controle") {
    y = sectionTitle(doc, "Contrôle", y);
    const conformeLabel = prestation.cycles > 0
      ? `${prestation.cycles} renvoi${prestation.cycles > 1 ? "s" : ""} en exécution avant validation — conforme après reprise`
      : "Conforme";
    y = twoColumns(
      doc,
      y,
      pageW,
      [
        ["Agent contrôle", prestation.agentControle || "—"],
        ["Période de contrôle", `Du ${prestation.dateDebutControle || "—"} au ${prestation.dateFinControle || "—"}`],
      ],
      [["Résultat", conformeLabel]]
    );
    y += 4;
    hline(doc, y, pageW);
    y += 10;
  }

  // Livraison
  if (prestation.stage === "livraison" && prestation.chemin && prestation.dateLivraison) {
    y = sectionTitle(doc, "Livraison", y);
    y = twoColumns(
      doc,
      y,
      pageW,
      [["Date de livraison", prestation.dateLivraison || "—"]],
      [["Référence du livrable", prestation.ref || "—"]]
    );
    y += 4;
    hline(doc, y, pageW);
    y += 10;
  }

  // Signatures — if the content above leaves too little room for the signature block plus the
  // footer, start a fresh page instead of letting them overlap.
  const pageH = doc.internal.pageSize.getHeight();
  const SIG_BLOCK_H = 34;
  const FOOTER_CLEARANCE = 14;
  let sigY = y + 10;
  if (sigY + SIG_BLOCK_H + FOOTER_CLEARANCE > pageH) {
    doc.addPage();
    sigY = 30;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20, 24, 31);
  doc.text("Agent chantier", MARGIN, sigY);
  doc.text("Responsable Globetudes", pageW / 2 + 5, sigY);
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, sigY + 4, pageW / 2 - MARGIN - 10, 22);
  doc.rect(pageW / 2 + 5, sigY + 4, pageW / 2 - MARGIN - 10, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(107, 111, 102);
  doc.text("Nom, date et signature", MARGIN, sigY + 30);
  doc.text("Nom, date et signature", pageW / 2 + 5, sigY + 30);

  doc.setFontSize(7.5);
  doc.setTextColor(107, 111, 102);
  doc.text(
    `Document généré automatiquement depuis glbOps le ${today()} — ${projet.id} / ${prestation.id}`,
    pageW / 2,
    pageH - 10,
    { align: "center" }
  );

  doc.save(`PV-${prestation.id}.pdf`);
}
