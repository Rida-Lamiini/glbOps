import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { COLORS, loadLogo, safe } from "./reportKit";
import { resourceUrl } from "./resourceLink";
import { RESOURCE_TYPES } from "../constants";

// A4 sheet of 3 x 7 adhesive labels (63.5 x 38.1 mm, the common "L7160" size), cut-guides included.
const COLS = 3;
const ROWS = 7;
const LABEL_W = 63.5;
const LABEL_H = 38.1;
const LEFT = 7.2;
const TOP = 15.1;
const GAP_X = 2.5;

async function qrDataUrl(text) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 0, width: 360, color: { dark: "#1d1b18", light: "#ffffff" } });
}

function drawLabel(doc, logo, qr, item, x, y) {
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, LABEL_W, LABEL_H, 2, 2, "S");

  // brand strip
  doc.setFillColor(...COLORS.accent);
  doc.rect(x, y + 2, 1.4, LABEL_H - 4, "F");
  if (logo) doc.addImage(logo.data, logo.format, x + 4, y + 3, 7, 7);
  doc.setFont("times", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.ink);
  doc.text("Globetudes", x + 12.5, y + 8);

  // name (up to two lines) and identity
  const textW = LABEL_W - 4 - 26 - 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.ink);
  const nameLines = doc.splitTextToSize(safe(item.nom), textW).slice(0, 2);
  doc.text(nameLines, x + 4, y + 16);
  const afterName = y + 16 + nameLines.length * 4;
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.accent);
  doc.text(safe(item.id), x + 4, afterName + 1);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  const sub = [item.marque, item.modele].filter(Boolean).join(" ") || RESOURCE_TYPES.find((t) => t.key === item.type)?.label || "";
  doc.text(doc.splitTextToSize(safe(sub), textW).slice(0, 1), x + 4, afterName + 5);

  // QR on the right
  doc.addImage(qr, "PNG", x + LABEL_W - 4 - 26, y + 4, 26, 26);
  doc.setFontSize(5.8);
  doc.setTextColor(...COLORS.muted);
  doc.text("Scanner : fiche, sortie, retour", x + LABEL_W - 4 - 13, y + 33.5, { align: "center" });
}

/** A4 sheet of QR labels for the given resources (`item` = { id, nom, type, marque, modele }). */
export async function generateLabelSheet(items, filename = "etiquettes-qr.pdf") {
  const logo = await loadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const perPage = COLS * ROWS;
  for (let i = 0; i < items.length; i += 1) {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const slot = i % perPage;
    const x = LEFT + (slot % COLS) * (LABEL_W + GAP_X);
    const y = TOP + Math.floor(slot / COLS) * LABEL_H;
    // eslint-disable-next-line no-await-in-loop
    const qr = await qrDataUrl(resourceUrl(items[i].id));
    drawLabel(doc, logo, qr, items[i], x, y);
  }
  doc.save(filename);
}

/** Inline SVG-ready data URL for on-screen previews. */
export const qrPreview = (id) => qrDataUrl(resourceUrl(id));
