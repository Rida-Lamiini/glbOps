import { jsPDF } from "jspdf";
import { today } from "./dates";

// One visual identity for every PDF the platform produces (PV, cadastral report, monthly report):
// logo, running header, numbered footer, and the same tables / KPI tiles / bars. Colours mirror the
// app tokens (ink / brick red / paper). jsPDF's built-in fonts only cover WinAnsi, so every string
// goes through `safe()` before it is drawn.

export const COLORS = {
  ink: [29, 27, 24],
  accent: [179, 38, 30],
  muted: [109, 102, 90],
  line: [221, 212, 194],
  paper: [239, 233, 220],
  surface: [255, 253, 248],
  good: [31, 122, 85],
  warn: [183, 121, 31],
  bad: [179, 38, 30],
  info: [47, 102, 144],
};
const TONES = { good: COLORS.good, warn: COLORS.warn, bad: COLORS.bad, info: COLORS.info, neutral: COLORS.muted, ink: COLORS.ink };
export const toneColor = (tone) => TONES[tone] || COLORS.ink;

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM = PAGE_H - 20;
const BODY = 9.5;

// WinAnsi-safe text: French accents are fine, arrows / ≤ / narrow spaces are not.
export function safe(value) {
  return String(value ?? "")
    .replace(/[   ]/g, " ")
    .replace(/→/g, "->")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/▲/g, "+")
    .replace(/▼/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\n\x20-\x7E -ÿŒœ–—•…]/g, "");
}

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

let logoPromise = null;
/** The company logo as a data URL with its natural size (cached). Null if it cannot be loaded. */
export function loadLogo(url = "/logo.png") {
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        const data = await blobToDataUrl(blob);
        const img = await loadImageElement(data);
        return { data, w: img.naturalWidth, h: img.naturalHeight, format: "PNG" };
      } catch {
        return null;
      }
    })();
  }
  return logoPromise;
}

/** A remote picture, downscaled and re-encoded as JPEG so the PDF stays light. Null on any failure. */
export async function fetchImage(url, maxSize = 900) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const src = await blobToDataUrl(await res.blob());
    const img = await loadImageElement(src);
    const ratio = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { data: canvas.toDataURL("image/jpeg", 0.82), w, h, format: "JPEG" };
  } catch {
    return null;
  }
}

export class Report {
  constructor({ title, eyebrow = "", subtitle = "", ref = "", logo = null }) {
    this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    this.title = title;
    this.ref = ref;
    this.logo = logo;
    this.y = 0;
    this.contentW = CONTENT_W;
    this.margin = MARGIN;
    this.drawCover({ eyebrow, subtitle });
  }

  // --- low level -------------------------------------------------------------------------
  text(str, x, y, opts) {
    this.doc.text(safe(str), x, y, opts);
  }
  lines(str, width) {
    // splitTextToSize ignores "\n", so paragraphs are wrapped one by one.
    return safe(str).split("\n").flatMap((part) => (part === "" ? [""] : this.doc.splitTextToSize(part, width)));
  }
  font(style = "normal", size = BODY, color = COLORS.ink, family = "helvetica") {
    this.doc.setFont(family, style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }
  fill(color) { this.doc.setFillColor(...color); }
  stroke(color, width = 0.2) { this.doc.setDrawColor(...color); this.doc.setLineWidth(width); }

  ensure(height) {
    if (this.y + height > BOTTOM) this.addPage();
  }

  addPage() {
    this.doc.addPage();
    this.drawRunningHeader();
    this.y = 28;
  }

  // --- page furniture ----------------------------------------------------------------------
  drawLogo(x, y, size) {
    if (!this.logo) return;
    const ratio = this.logo.w / this.logo.h;
    const w = ratio >= 1 ? size : size * ratio;
    const h = ratio >= 1 ? size / ratio : size;
    this.doc.addImage(this.logo.data, this.logo.format, x, y, w, h);
  }

  drawCover({ eyebrow, subtitle }) {
    const d = this.doc;
    this.drawLogo(MARGIN, 11, 20);
    this.font("bold", 21, COLORS.ink, "times");
    this.text("Globetudes", MARGIN + 25, 21.5);
    this.font("normal", 8.5, COLORS.accent);
    d.setCharSpace(0.5);
    this.text("PRESTATIONS TOPOGRAPHIQUES", MARGIN + 25, 27);
    d.setCharSpace(0);

    this.font("bold", 8.5, COLORS.accent);
    if (this.ref) this.text(this.ref, PAGE_W - MARGIN, 18, { align: "right" });
    this.font("normal", 8.5, COLORS.muted);
    this.text(`Édité le ${today()}`, PAGE_W - MARGIN, 23.5, { align: "right" });

    this.stroke(COLORS.ink, 0.9);
    d.line(MARGIN, 36, PAGE_W - MARGIN, 36);
    this.fill(COLORS.accent);
    d.rect(MARGIN, 35.55, 34, 1.7, "F");

    let y = 48;
    if (eyebrow) {
      this.font("bold", 8.5, COLORS.accent);
      d.setCharSpace(0.6);
      this.text(eyebrow.toUpperCase(), MARGIN, y);
      d.setCharSpace(0);
      y += 8;
    }
    this.font("bold", 24, COLORS.ink, "times");
    const titleLines = this.lines(this.title, CONTENT_W);
    this.doc.text(titleLines, MARGIN, y);
    y += titleLines.length * 9.5;
    if (subtitle) {
      this.font("normal", 10.5, COLORS.muted);
      const sub = this.lines(subtitle, CONTENT_W);
      this.doc.text(sub, MARGIN, y - 1);
      y += sub.length * 5;
    }
    this.y = y + 6;
  }

  drawRunningHeader() {
    this.drawLogo(MARGIN, 8, 8);
    this.font("bold", 10, COLORS.ink, "times");
    this.text("Globetudes", MARGIN + 10.5, 13.5);
    this.font("normal", 8, COLORS.muted);
    this.text(this.title, PAGE_W - MARGIN, 13.5, { align: "right" });
    this.stroke(COLORS.ink, 0.5);
    this.doc.line(MARGIN, 19, PAGE_W - MARGIN, 19);
  }

  // --- content blocks ----------------------------------------------------------------------
  section(title, { note = "", keep = 0 } = {}) {
    // `keep`: height of the content that must stay on the same page as the heading.
    this.ensure(Math.max(22, keep + 12));
    this.y += 3;
    this.fill(COLORS.accent);
    this.doc.rect(MARGIN, this.y - 4.2, 2.2, 6, "F");
    this.font("bold", 13, COLORS.ink, "times");
    this.text(title, MARGIN + 5, this.y);
    if (note) {
      this.font("normal", 8.5, COLORS.muted);
      this.text(note, PAGE_W - MARGIN, this.y, { align: "right" });
    }
    this.stroke(COLORS.line, 0.3);
    this.doc.line(MARGIN, this.y + 2.6, PAGE_W - MARGIN, this.y + 2.6);
    this.y += 7;
  }

  paragraph(text, { size = BODY, color = COLORS.ink, style = "normal", gap = 3 } = {}) {
    this.font(style, size, color);
    const lines = this.lines(text, CONTENT_W);
    const lh = size * 0.42;
    lines.forEach((line) => {
      this.ensure(lh + 1);
      this.text(line, MARGIN, this.y);
      this.y += lh;
    });
    this.y += gap;
  }

  /** Label / value pairs on a grid. `pairs` = [[label, value], ...]. */
  kv(pairs, { cols = 2 } = {}) {
    const gap = 8;
    const cw = (CONTENT_W - gap * (cols - 1)) / cols;
    for (let i = 0; i < pairs.length; i += cols) {
      const row = pairs.slice(i, i + cols);
      this.font("normal", BODY);
      const heights = row.map(([, value]) => this.lines(value || "—", cw).length * 4.3 + 6.5);
      const rowH = Math.max(...heights);
      this.ensure(rowH);
      row.forEach(([label, value], c) => {
        const x = MARGIN + c * (cw + gap);
        this.font("bold", 7, COLORS.muted);
        this.doc.setCharSpace(0.3);
        this.text(String(label).toUpperCase(), x, this.y);
        this.doc.setCharSpace(0);
        this.font("normal", BODY, COLORS.ink);
        this.doc.text(this.lines(value || "—", cw), x, this.y + 4.6);
      });
      this.y += rowH + 1.5;
    }
  }

  /** Row of KPI tiles. tiles = [{ label, value, sub, tone }] */
  kpis(tiles) {
    const gap = 4;
    const n = tiles.length;
    const w = (CONTENT_W - gap * (n - 1)) / n;
    const h = 25;
    this.ensure(h + 2);
    tiles.forEach((t, i) => {
      const x = MARGIN + i * (w + gap);
      this.fill(COLORS.paper);
      this.doc.roundedRect(x, this.y, w, h, 2, 2, "F");
      this.fill(toneColor(t.tone));
      this.doc.rect(x, this.y + 2, 1.4, h - 4, "F");
      this.font("bold", 6.8, COLORS.muted);
      this.doc.setCharSpace(0.3);
      this.text(String(t.label).toUpperCase(), x + 5, this.y + 6.5, { maxWidth: w - 7 });
      this.doc.setCharSpace(0);
      this.font("bold", 19, t.tone ? toneColor(t.tone) : COLORS.ink, "times");
      this.text(t.value, x + 5, this.y + 15.5);
      if (t.sub) {
        this.font("normal", 7.5, COLORS.muted);
        this.text(t.sub, x + 5, this.y + 21, { maxWidth: w - 7 });
      }
    });
    this.y += h + 5;
  }

  callout(title, body, tone = "info") {
    const color = toneColor(tone);
    this.font("normal", BODY);
    const lines = body ? this.lines(body, CONTENT_W - 14) : [];
    const h = 8 + lines.length * 4.3 + (body ? 2 : 0);
    this.ensure(h + 3);
    this.fill([Math.round(255 - (255 - color[0]) * 0.1), Math.round(255 - (255 - color[1]) * 0.1), Math.round(255 - (255 - color[2]) * 0.1)]);
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, h, 2, 2, "F");
    this.fill(color);
    this.doc.rect(MARGIN, this.y, 2.2, h, "F");
    this.font("bold", 10, color);
    this.text(title, MARGIN + 7, this.y + 6);
    if (lines.length) {
      this.font("normal", BODY, COLORS.ink);
      this.doc.text(lines, MARGIN + 7, this.y + 11.5);
    }
    this.y += h + 4;
  }

  /**
   * Table with a repeated header, zebra rows and wrapped cells.
   * cols: [{ label, w (relative), align }]; rows: arrays of string | { text, tone, bold }.
   */
  table({ cols, rows, size = 8.5, emptyText = "Aucune donnée." }) {
    const total = cols.reduce((s, c) => s + c.w, 0);
    const widths = cols.map((c) => (c.w / total) * CONTENT_W);
    const pad = 2.2;
    const lh = size * 0.42;

    const header = () => {
      this.ensure(9);
      this.fill(COLORS.ink);
      this.doc.rect(MARGIN, this.y, CONTENT_W, 7, "F");
      this.font("bold", 7.2, [255, 255, 255]);
      let x = MARGIN;
      cols.forEach((c, i) => {
        const tx = c.align === "right" ? x + widths[i] - pad : x + pad;
        this.text(String(c.label).toUpperCase(), tx, this.y + 4.7, { align: c.align === "right" ? "right" : "left" });
        x += widths[i];
      });
      this.y += 7;
    };

    header();
    if (rows.length === 0) {
      this.font("normal", size, COLORS.muted);
      this.text(emptyText, MARGIN + pad, this.y + 6);
      this.y += 10;
      return;
    }
    rows.forEach((row, ri) => {
      this.font("normal", size);
      const cells = row.map((cell, i) => {
        const obj = typeof cell === "object" && cell !== null ? cell : { text: cell };
        return { ...obj, lines: this.lines(obj.text ?? "—", widths[i] - 2 * pad) };
      });
      const h = Math.max(...cells.map((c) => c.lines.length)) * lh + 2 * pad;
      if (this.y + h > BOTTOM) {
        this.addPage();
        header();
      }
      if (ri % 2 === 1) {
        this.fill(COLORS.paper);
        this.doc.rect(MARGIN, this.y, CONTENT_W, h, "F");
      }
      let x = MARGIN;
      cells.forEach((c, i) => {
        this.font(c.bold ? "bold" : "normal", size, c.tone ? toneColor(c.tone) : COLORS.ink);
        const tx = cols[i].align === "right" ? x + widths[i] - pad : x + pad;
        this.doc.text(c.lines, tx, this.y + pad + lh * 0.8, { align: cols[i].align === "right" ? "right" : "left" });
        x += widths[i];
      });
      this.stroke(COLORS.line, 0.15);
      this.doc.line(MARGIN, this.y + h, PAGE_W - MARGIN, this.y + h);
      this.y += h;
    });
    this.y += 4;
  }

  /** Horizontal bars. items = [{ label, value, color, note }] */
  bars(items, { labelW = 46, max } = {}) {
    const top = max ?? Math.max(1, ...items.map((i) => i.value));
    const barW = CONTENT_W - labelW - 16;
    items.forEach((it) => {
      this.ensure(6.5);
      this.font("normal", 8.8, it.value === 0 ? COLORS.muted : COLORS.ink);
      this.text(it.label, MARGIN, this.y + 3.6, { maxWidth: labelW - 2 });
      this.fill(COLORS.paper);
      this.doc.roundedRect(MARGIN + labelW, this.y + 0.6, barW, 4, 1.5, 1.5, "F");
      if (it.value > 0) {
        this.fill(it.color || COLORS.accent);
        this.doc.roundedRect(MARGIN + labelW, this.y + 0.6, Math.max(2.5, (it.value / top) * barW), 4, 1.5, 1.5, "F");
      }
      this.font("bold", 9.5, COLORS.ink, "times");
      this.text(String(it.value), PAGE_W - MARGIN, this.y + 4, { align: "right" });
      this.y += 6;
    });
    this.y += 1;
  }

  /** Paired columns per period (e.g. requests vs deliveries). data = [{ label, a, b }] */
  columns(data, { aLabel, bLabel, height = 30 }) {
    this.ensure(height + 14);
    const top = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
    const baseY = this.y + height;
    const slot = CONTENT_W / data.length;
    const bw = Math.min(9, slot / 3);
    this.stroke(COLORS.line, 0.2);
    this.doc.line(MARGIN, baseY, PAGE_W - MARGIN, baseY);
    data.forEach((d, i) => {
      const cx = MARGIN + slot * i + slot / 2;
      [[d.a, COLORS.accent, -bw - 0.5], [d.b, COLORS.good, 0.5]].forEach(([v, color, dx]) => {
        const h = (v / top) * (height - 8);
        if (v > 0) {
          this.fill(color);
          this.doc.rect(cx + dx, baseY - h, bw, h, "F");
          this.font("bold", 7.5, COLORS.ink);
          this.text(String(v), cx + dx + bw / 2, baseY - h - 1.2, { align: "center" });
        }
      });
      this.font("normal", 7.8, COLORS.muted);
      this.text(d.label, cx, baseY + 4.5, { align: "center" });
    });
    // legend
    const ly = baseY + 10;
    this.fill(COLORS.accent);
    this.doc.rect(MARGIN, ly - 2.6, 3, 3, "F");
    this.font("normal", 8, COLORS.ink);
    this.text(aLabel, MARGIN + 4.5, ly);
    this.fill(COLORS.good);
    this.doc.rect(MARGIN + 40, ly - 2.6, 3, 3, "F");
    this.text(bLabel, MARGIN + 44.5, ly);
    this.y = ly + 6;
  }

  /**
   * Outline of a survey lot from its Lambert coordinates, with vertex labels, north arrow and scale.
   * points = [{ name, x, y }]. Draws inside a w x h box at the current position (no page break).
   */
  plot(points, { w = 96, h = 78, x = MARGIN } = {}) {
    const d = this.doc;
    const y0 = this.y;
    this.fill(COLORS.surface);
    this.stroke(COLORS.line, 0.3);
    d.roundedRect(x, y0, w, h, 2, 2, "FD");
    if (points.length < 3) {
      this.font("normal", 8.5, COLORS.muted);
      this.text("Plan indisponible (moins de 3 bornes).", x + w / 2, y0 + h / 2, { align: "center" });
      return { w, h };
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 14;
    const dx = Math.max(maxX - minX, 1e-6);
    const dy = Math.max(maxY - minY, 1e-6);
    const scale = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy); // mm per metre
    const offX = x + (w - dx * scale) / 2;
    const offY = y0 + (h - dy * scale) / 2;
    const px = (p) => offX + (p.x - minX) * scale;
    const py = (p) => offY + (maxY - p.y) * scale;

    // faint grid
    this.stroke([232, 225, 209], 0.15);
    for (let g = 1; g < 4; g += 1) {
      d.line(x + (w * g) / 4, y0 + 1, x + (w * g) / 4, y0 + h - 1);
      d.line(x + 1, y0 + (h * g) / 4, x + w - 1, y0 + (h * g) / 4);
    }

    // polygon
    const rel = points.slice(1).map((p, i) => [px(p) - px(points[i]), py(p) - py(points[i])]);
    this.fill([245, 220, 216]);
    this.stroke(COLORS.accent, 0.6);
    d.lines(rel, px(points[0]), py(points[0]), [1, 1], "FD", true);

    // vertices + labels (pushed outward from the centroid)
    const cx = points.reduce((s, p) => s + px(p), 0) / points.length;
    const cy = points.reduce((s, p) => s + py(p), 0) / points.length;
    points.forEach((p) => {
      this.fill(COLORS.ink);
      d.circle(px(p), py(p), 0.9, "F");
      const vx = px(p) - cx, vy = py(p) - cy;
      const len = Math.hypot(vx, vy) || 1;
      const lx = px(p) + (vx / len) * 2.2;
      const ly = py(p) + (vy / len) * 2.2 + 1;
      this.font("normal", 6.2, COLORS.ink);
      this.text(p.name, lx, ly, { align: vx < -0.5 ? "right" : vx > 0.5 ? "left" : "center" });
    });

    // north arrow
    const nx = x + w - 8, ny = y0 + 6;
    this.fill(COLORS.ink);
    d.triangle(nx, ny, nx - 2, ny + 6, nx + 2, ny + 6, "F");
    this.font("bold", 7, COLORS.ink);
    this.text("N", nx, ny - 1, { align: "center" });

    // scale bar
    const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    const chosen = [...nice].reverse().find((m) => m * scale <= w * 0.32) || nice[0];
    const barLen = chosen * scale;
    const bx = x + 5, by = y0 + h - 6;
    this.stroke(COLORS.ink, 0.5);
    d.line(bx, by, bx + barLen, by);
    d.line(bx, by - 1.2, bx, by + 1.2);
    d.line(bx + barLen, by - 1.2, bx + barLen, by + 1.2);
    this.font("normal", 6.8, COLORS.ink);
    this.text(`${chosen} m`, bx + barLen / 2, by - 2, { align: "center" });
    return { w, h };
  }

  /** Photo grid, 3 per row. photos = [{ data, w, h, format, caption }] */
  photoGrid(photos, { cols = 3, cellH = 44 } = {}) {
    const gap = 4;
    const cw = (CONTENT_W - gap * (cols - 1)) / cols;
    for (let i = 0; i < photos.length; i += cols) {
      this.ensure(cellH + 12);
      photos.slice(i, i + cols).forEach((p, c) => {
        const x = MARGIN + c * (cw + gap);
        this.fill(COLORS.paper);
        this.doc.roundedRect(x, this.y, cw, cellH, 1.5, 1.5, "F");
        const s = Math.min((cw - 2) / p.w, (cellH - 2) / p.h);
        const iw = p.w * s, ih = p.h * s;
        this.doc.addImage(p.data, p.format, x + (cw - iw) / 2, this.y + (cellH - ih) / 2, iw, ih);
        this.font("normal", 7.2, COLORS.muted);
        const cap = this.lines(p.caption || "", cw)[0] || "";
        this.text(cap, x, this.y + cellH + 3.6, { maxWidth: cw });
      });
      this.y += cellH + 8;
    }
  }

  /** Signature boxes side by side. boxes = [{ role, name, date }] */
  signatures(boxes) {
    const gap = 6;
    const n = boxes.length;
    const w = (CONTENT_W - gap * (n - 1)) / n;
    const h = 34;
    this.ensure(h + 8);
    boxes.forEach((b, i) => {
      const x = MARGIN + i * (w + gap);
      this.font("bold", 8.5, COLORS.ink);
      this.text(b.role, x, this.y + 3);
      this.stroke(COLORS.muted, 0.25);
      this.doc.roundedRect(x, this.y + 6, w, 22, 1.5, 1.5, "S");
      this.font("normal", 7.5, COLORS.muted);
      const meta = [b.name, b.date].filter(Boolean).join(" - ");
      this.text(meta || "Nom, date et signature", x, this.y + 32);
    });
    this.y += h + 4;
  }

  finalize(filename) {
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i += 1) {
      this.doc.setPage(i);
      this.stroke(COLORS.line, 0.3);
      this.doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
      this.font("normal", 7.5, COLORS.muted);
      this.text(`Document généré par glbOps le ${today()}${this.ref ? ` - ${this.ref}` : ""}`, MARGIN, PAGE_H - 9.5);
      this.text(`Page ${i} / ${total}`, PAGE_W - MARGIN, PAGE_H - 9.5, { align: "right" });
    }
    this.doc.save(filename);
  }
}
