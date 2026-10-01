"""One visual identity for every PDF the platform produces (PV, cadastral report, monthly report):
logo, running header, numbered footer, and the same tables / KPI tiles / bars. A port of the
frontend's former utils/reportKit.js (jsPDF) to PyMuPDF, keeping its millimetre layout so the
documents look the same. Colours mirror the app tokens (ink / brick red / paper).

PyMuPDF's bundled Nimbus fonts (Helvetica / Times metrics) are embedded as real Unicode fonts, so
French accents, "—", "≤", "→" and "²" print as they are — no WinAnsi down-conversion needed.
"""

import math
from pathlib import Path

import fitz
from django.utils import timezone

COLORS = {
    "ink": (29, 27, 24),
    "accent": (179, 38, 30),
    "muted": (109, 102, 90),
    "line": (221, 212, 194),
    "paper": (239, 233, 220),
    "surface": (255, 253, 248),
    "good": (31, 122, 85),
    "warn": (183, 121, 31),
    "bad": (179, 38, 30),
    "info": (47, 102, 144),
    "white": (255, 255, 255),
}
TONES = {"good": "good", "warn": "warn", "bad": "bad", "info": "info", "neutral": "muted", "ink": "ink"}

PAGE_W, PAGE_H = 210, 297
MARGIN = 16
CONTENT_W = PAGE_W - 2 * MARGIN
BOTTOM = PAGE_H - 20
BODY = 9.5
PT = 72 / 25.4  # points per millimetre
MM_PER_PT = 25.4 / 72
LINE_FACTOR = 1.15  # jsPDF's default line height, kept so wrapped text spaces the same way

LOGO_PATH = Path(__file__).resolve().parent / "assets" / "logo.png"

_FONTS = {
    ("helvetica", "normal"): ("gH", "helv"),
    ("helvetica", "bold"): ("gHB", "hebo"),
    ("times", "normal"): ("gT", "tiro"),
    ("times", "bold"): ("gTB", "tibo"),
}
_FONT_OBJECTS = {}


def _font_object(key):
    if key not in _FONT_OBJECTS:
        _FONT_OBJECTS[key] = fitz.Font(_FONTS[key][1])
    return _FONT_OBJECTS[key]


def rgb(color):
    """A colour name or an (r, g, b) 0-255 tuple, as PyMuPDF's 0-1 floats."""
    if isinstance(color, str):
        color = COLORS[color]
    return tuple(c / 255 for c in color)


def tone_color(tone):
    return COLORS[TONES.get(tone, "ink")]


def today_fr():
    return timezone.localdate().strftime("%d/%m/%Y")


def fr_date(value):
    """A date (or None) the way the app shows it: DD/MM/YYYY."""
    return value.strftime("%d/%m/%Y") if value else ""


def num(value, digits=2):
    """French number formatting: thin groups with a space, decimal comma."""
    text = f"{float(value):,.{digits}f}"
    return text.replace(",", " ").replace(".", ",")


def image_for_pdf(data, max_size=900):
    """A picture downscaled and re-encoded as JPEG so the PDF stays light, with its size in
    pixels. None when the bytes are not a readable image."""
    try:
        pix = fitz.Pixmap(data)
        if pix.alpha:
            pix = fitz.Pixmap(pix, 0)
        if pix.colorspace is None or pix.colorspace.n not in (1, 3):
            pix = fitz.Pixmap(fitz.csRGB, pix)
        # shrink() halves each time; stop before going under max_size, the PDF scales the rest.
        while max(pix.width, pix.height) / 2 >= max_size:
            pix.shrink(1)
        return {"data": pix.tobytes("jpeg", jpg_quality=82), "w": pix.width, "h": pix.height}
    except Exception:
        return None


class Report:
    def __init__(self, title, eyebrow="", subtitle="", ref=""):
        self.doc = fitz.open()
        self.title = title
        self.ref = ref
        self.logo = LOGO_PATH.read_bytes() if LOGO_PATH.exists() else None
        if self.logo:
            pix = fitz.Pixmap(self.logo)
            self.logo_size = (pix.width, pix.height)
        self.y = 0
        self.contentW = CONTENT_W
        self.margin = MARGIN
        self._font = ("helvetica", "normal")
        self._size = BODY
        self._color = COLORS["ink"]
        self._new_page()
        self.draw_cover(eyebrow, subtitle)

    # --- low level ------------------------------------------------------------------------
    def _new_page(self):
        self.page = self.doc.new_page(width=PAGE_W * PT, height=PAGE_H * PT)
        for key, (name, _) in _FONTS.items():
            self.page.insert_font(fontname=name, fontbuffer=_font_object(key).buffer)

    def font(self, style="normal", size=BODY, color="ink", family="helvetica"):
        self._font = (family, style)
        self._size = size
        self._color = COLORS[color] if isinstance(color, str) else color

    def width(self, text, size=None):
        return _font_object(self._font).text_length(str(text), fontsize=size or self._size) * MM_PER_PT

    @property
    def line_height(self):
        return self._size * LINE_FACTOR * MM_PER_PT

    def text(self, text, x, y, align="left", max_width=None):
        """One line at baseline y (mm). With max_width the text wraps and every line is drawn."""
        lines = self.lines(text, max_width) if max_width else [str(text)]
        for i, line in enumerate(lines):
            w = self.width(line)
            tx = x - w if align == "right" else x - w / 2 if align == "center" else x
            self.page.insert_text(
                fitz.Point(tx * PT, (y + i * self.line_height) * PT), line,
                fontname=_FONTS[self._font][0], fontsize=self._size, color=rgb(self._color),
            )

    def text_lines(self, lines, x, y, align="left"):
        for i, line in enumerate(lines):
            self.text(line, x, y + i * self.line_height, align=align)

    def lines(self, text, width):
        """Word-wrapped lines, paragraph by paragraph ("\\n" is kept)."""
        out = []
        for part in str(text if text is not None else "").split("\n"):
            if part == "":
                out.append("")
                continue
            line = ""
            for word in part.split(" "):
                candidate = f"{line} {word}" if line else word
                if self.width(candidate) <= width:
                    line = candidate
                    continue
                if line:
                    out.append(line)
                # A single word wider than the column is cut, like jsPDF does.
                while self.width(word) > width and len(word) > 1:
                    cut = len(word)
                    while cut > 1 and self.width(word[:cut]) > width:
                        cut -= 1
                    out.append(word[:cut])
                    word = word[cut:]
                line = word
            out.append(line)
        return out

    def rect(self, x, y, w, h, fill=None, stroke=None, radius=0, lw=0.2):
        r = fitz.Rect(x * PT, y * PT, (x + w) * PT, (y + h) * PT)
        rel = min(0.5, radius / min(w, h)) if radius and min(w, h) > 0 else None
        self.page.draw_rect(
            r, color=rgb(stroke) if stroke else None, fill=rgb(fill) if fill else None,
            width=lw * PT if stroke else 0, radius=rel,
        )

    def line(self, x1, y1, x2, y2, color="ink", lw=0.2):
        self.page.draw_line(fitz.Point(x1 * PT, y1 * PT), fitz.Point(x2 * PT, y2 * PT), color=rgb(color), width=lw * PT)

    def polygon(self, points, fill=None, stroke=None, lw=0.2):
        self.page.draw_polyline(
            [fitz.Point(x * PT, y * PT) for x, y in points], closePath=True,
            color=rgb(stroke) if stroke else None, fill=rgb(fill) if fill else None, width=lw * PT,
        )

    def circle(self, x, y, r, fill):
        self.page.draw_circle(fitz.Point(x * PT, y * PT), r * PT, color=None, fill=rgb(fill))

    def image(self, data, x, y, w, h):
        self.page.insert_image(fitz.Rect(x * PT, y * PT, (x + w) * PT, (y + h) * PT), stream=data)

    def ensure(self, height):
        if self.y + height > BOTTOM:
            self.add_page()

    def add_page(self):
        self._new_page()
        self.draw_running_header()
        self.y = 28

    # --- page furniture -------------------------------------------------------------------
    def draw_logo(self, x, y, size):
        if not self.logo:
            return
        lw, lh = self.logo_size
        ratio = lw / lh
        w = size if ratio >= 1 else size * ratio
        h = size / ratio if ratio >= 1 else size
        self.image(self.logo, x, y, w, h)

    def draw_cover(self, eyebrow, subtitle):
        self.draw_logo(MARGIN, 11, 20)
        self.font("bold", 21, "ink", "times")
        self.text("Globetudes", MARGIN + 25, 21.5)
        self.font("normal", 8.5, "accent")
        self.text("PRESTATIONS TOPOGRAPHIQUES", MARGIN + 25, 27)

        self.font("bold", 8.5, "accent")
        if self.ref:
            self.text(self.ref, PAGE_W - MARGIN, 18, align="right")
        self.font("normal", 8.5, "muted")
        self.text(f"Édité le {today_fr()}", PAGE_W - MARGIN, 23.5, align="right")

        self.line(MARGIN, 36, PAGE_W - MARGIN, 36, "ink", 0.9)
        self.rect(MARGIN, 35.55, 34, 1.7, fill="accent")

        y = 48
        if eyebrow:
            self.font("bold", 8.5, "accent")
            self.text(eyebrow.upper(), MARGIN, y)
            y += 8
        self.font("bold", 24, "ink", "times")
        title_lines = self.lines(self.title, CONTENT_W)
        self.text_lines(title_lines, MARGIN, y)
        y += len(title_lines) * 9.5
        if subtitle:
            self.font("normal", 10.5, "muted")
            sub = self.lines(subtitle, CONTENT_W)
            self.text_lines(sub, MARGIN, y - 1)
            y += len(sub) * 5
        self.y = y + 6

    def draw_running_header(self):
        self.draw_logo(MARGIN, 8, 8)
        self.font("bold", 10, "ink", "times")
        self.text("Globetudes", MARGIN + 10.5, 13.5)
        self.font("normal", 8, "muted")
        self.text(self.title, PAGE_W - MARGIN, 13.5, align="right")
        self.line(MARGIN, 19, PAGE_W - MARGIN, 19, "ink", 0.5)

    # --- content blocks -------------------------------------------------------------------
    def section(self, title, note="", keep=0):
        """`keep`: height of the content that must stay on the same page as the heading."""
        self.ensure(max(22, keep + 12))
        self.y += 3
        self.rect(MARGIN, self.y - 4.2, 2.2, 6, fill="accent")
        self.font("bold", 13, "ink", "times")
        self.text(title, MARGIN + 5, self.y)
        if note:
            self.font("normal", 8.5, "muted")
            self.text(note, PAGE_W - MARGIN, self.y, align="right")
        self.line(MARGIN, self.y + 2.6, PAGE_W - MARGIN, self.y + 2.6, "line", 0.3)
        self.y += 7

    def paragraph(self, text, size=BODY, color="ink", style="normal", gap=3):
        self.font(style, size, color)
        lh = size * 0.42
        for line in self.lines(text, CONTENT_W):
            self.ensure(lh + 1)
            self.text(line, MARGIN, self.y)
            self.y += lh
        self.y += gap

    def kv(self, pairs, cols=2):
        """Label / value pairs on a grid. pairs = [(label, value), ...]."""
        gap = 8
        cw = (CONTENT_W - gap * (cols - 1)) / cols
        for i in range(0, len(pairs), cols):
            row = pairs[i:i + cols]
            self.font("normal", BODY)
            row_h = max(len(self.lines(value or "—", cw)) * 4.3 + 6.5 for _, value in row)
            self.ensure(row_h)
            for c, (label, value) in enumerate(row):
                x = MARGIN + c * (cw + gap)
                self.font("bold", 7, "muted")
                self.text(str(label).upper(), x, self.y)
                self.font("normal", BODY, "ink")
                self.text_lines(self.lines(value or "—", cw), x, self.y + 4.6)
            self.y += row_h + 1.5

    def kpis(self, tiles):
        """Row of KPI tiles. tiles = [{label, value, sub, tone}]"""
        gap = 4
        n = len(tiles)
        w = (CONTENT_W - gap * (n - 1)) / n
        h = 25
        self.ensure(h + 2)
        for i, t in enumerate(tiles):
            x = MARGIN + i * (w + gap)
            self.rect(x, self.y, w, h, fill="paper", radius=2)
            self.rect(x, self.y + 2, 1.4, h - 4, fill=tone_color(t.get("tone")))
            self.font("bold", 6.8, "muted")
            self.text(self.lines(str(t["label"]).upper(), w - 7)[0], x + 5, self.y + 6.5)
            self.font("bold", 19, tone_color(t["tone"]) if t.get("tone") else "ink", "times")
            self.text(t["value"], x + 5, self.y + 15.5)
            if t.get("sub"):
                self.font("normal", 7.5, "muted")
                self.text(self.lines(t["sub"], w - 7)[0], x + 5, self.y + 21)
        self.y += h + 5

    def callout(self, title, body, tone="info"):
        color = tone_color(tone)
        self.font("normal", BODY)
        lines = self.lines(body, CONTENT_W - 14) if body else []
        h = 8 + len(lines) * 4.3 + (2 if body else 0)
        self.ensure(h + 3)
        tint = tuple(round(255 - (255 - c) * 0.1) for c in color)
        self.rect(MARGIN, self.y, CONTENT_W, h, fill=tint, radius=2)
        self.rect(MARGIN, self.y, 2.2, h, fill=color)
        self.font("bold", 10, color)
        self.text(title, MARGIN + 7, self.y + 6)
        if lines:
            self.font("normal", BODY, "ink")
            self.text_lines(lines, MARGIN + 7, self.y + 11.5)
        self.y += h + 4

    def table(self, cols, rows, size=8.5, empty_text="Aucune donnée."):
        """Table with a repeated header, zebra rows and wrapped cells.
        cols: [{label, w (relative), align}]; rows: lists of str | {text, tone, bold}."""
        total = sum(c["w"] for c in cols)
        widths = [c["w"] / total * CONTENT_W for c in cols]
        pad = 2.2
        lh = size * 0.42

        def header(keep=0):
            self.ensure(9 + keep)
            self.rect(MARGIN, self.y, CONTENT_W, 7, fill="ink")
            self.font("bold", 7.2, "white")
            x = MARGIN
            for c, w in zip(cols, widths):
                right = c.get("align") == "right"
                self.text(str(c["label"]).upper(), x + w - pad if right else x + pad, self.y + 4.7, align="right" if right else "left")
                x += w
            self.y += 7

        # Never leave the header alone at the foot of a page: keep room for a first row.
        header(keep=2 * pad + 2 * lh)
        if not rows:
            self.font("normal", size, "muted")
            self.text(empty_text, MARGIN + pad, self.y + 6)
            self.y += 10
            return
        for ri, row in enumerate(rows):
            self.font("normal", size)
            cells = []
            for cell, w in zip(row, widths):
                obj = cell if isinstance(cell, dict) else {"text": cell}
                cells.append({**obj, "lines": self.lines(obj.get("text") or "—", w - 2 * pad)})
            h = max(len(c["lines"]) for c in cells) * lh + 2 * pad
            if self.y + h > BOTTOM:
                self.add_page()
                header()
            if ri % 2 == 1:
                self.rect(MARGIN, self.y, CONTENT_W, h, fill="paper")
            x = MARGIN
            for c, col, w in zip(cells, cols, widths):
                self.font("bold" if c.get("bold") else "normal", size, tone_color(c["tone"]) if c.get("tone") else "ink")
                right = col.get("align") == "right"
                tx = x + w - pad if right else x + pad
                for li, line in enumerate(c["lines"]):
                    self.text(line, tx, self.y + pad + lh * 0.8 + li * lh, align="right" if right else "left")
                x += w
            self.line(MARGIN, self.y + h, PAGE_W - MARGIN, self.y + h, "line", 0.15)
            self.y += h
        self.y += 4

    def bars(self, items, label_w=46, top=None):
        """Horizontal bars. items = [{label, value, color}]"""
        top = top or max([1] + [i["value"] for i in items])
        bar_w = CONTENT_W - label_w - 16
        for it in items:
            self.ensure(6.5)
            self.font("normal", 8.8, "muted" if it["value"] == 0 else "ink")
            self.text(self.lines(it["label"], label_w - 2)[0], MARGIN, self.y + 3.6)
            self.rect(MARGIN + label_w, self.y + 0.6, bar_w, 4, fill="paper", radius=1.5)
            if it["value"] > 0:
                self.rect(MARGIN + label_w, self.y + 0.6, max(2.5, it["value"] / top * bar_w), 4, fill=it.get("color") or "accent", radius=1.5)
            self.font("bold", 9.5, "ink", "times")
            self.text(str(it["value"]), PAGE_W - MARGIN, self.y + 4, align="right")
            self.y += 6
        self.y += 1

    def columns(self, data, a_label, b_label, height=30):
        """Paired columns per period (e.g. requests vs deliveries). data = [{label, a, b}]"""
        self.ensure(height + 14)
        top = max([1] + [v for d in data for v in (d["a"], d["b"])])
        base_y = self.y + height
        slot = CONTENT_W / len(data)
        bw = min(9, slot / 3)
        self.line(MARGIN, base_y, PAGE_W - MARGIN, base_y, "line", 0.2)
        for i, d in enumerate(data):
            cx = MARGIN + slot * i + slot / 2
            for v, color, dx in ((d["a"], "accent", -bw - 0.5), (d["b"], "good", 0.5)):
                h = v / top * (height - 8)
                if v > 0:
                    self.rect(cx + dx, base_y - h, bw, h, fill=color)
                    self.font("bold", 7.5, "ink")
                    self.text(str(v), cx + dx + bw / 2, base_y - h - 1.2, align="center")
            self.font("normal", 7.8, "muted")
            self.text(d["label"], cx, base_y + 4.5, align="center")
        ly = base_y + 10
        self.rect(MARGIN, ly - 2.6, 3, 3, fill="accent")
        self.font("normal", 8, "ink")
        self.text(a_label, MARGIN + 4.5, ly)
        self.rect(MARGIN + 40, ly - 2.6, 3, 3, fill="good")
        self.text(b_label, MARGIN + 44.5, ly)
        self.y = ly + 6

    def plot(self, points, w=96, h=78, x=MARGIN):
        """Outline of a survey lot from its Lambert coordinates, with vertex labels, north arrow and
        scale. points = [(name, x, y)]. Draws inside a w x h box at the current position."""
        y0 = self.y
        self.rect(x, y0, w, h, fill="surface", stroke="line", radius=2, lw=0.3)
        if len(points) < 3:
            self.font("normal", 8.5, "muted")
            self.text("Plan indisponible (moins de 3 bornes).", x + w / 2, y0 + h / 2, align="center")
            return
        xs = [p[1] for p in points]
        ys = [p[2] for p in points]
        min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
        pad = 14
        dx = max(max_x - min_x, 1e-6)
        dy = max(max_y - min_y, 1e-6)
        scale = min((w - 2 * pad) / dx, (h - 2 * pad) / dy)  # mm per metre
        off_x = x + (w - dx * scale) / 2
        off_y = y0 + (h - dy * scale) / 2

        def px(p):
            return off_x + (p[1] - min_x) * scale

        def py(p):
            return off_y + (max_y - p[2]) * scale

        for g in range(1, 4):
            self.line(x + w * g / 4, y0 + 1, x + w * g / 4, y0 + h - 1, (232, 225, 209), 0.15)
            self.line(x + 1, y0 + h * g / 4, x + w - 1, y0 + h * g / 4, (232, 225, 209), 0.15)

        self.polygon([(px(p), py(p)) for p in points], fill=(245, 220, 216), stroke="accent", lw=0.6)

        cx = sum(px(p) for p in points) / len(points)
        cy = sum(py(p) for p in points) / len(points)
        for p in points:
            self.circle(px(p), py(p), 0.9, "ink")
            vx, vy = px(p) - cx, py(p) - cy
            length = math.hypot(vx, vy) or 1
            lx = px(p) + vx / length * 2.2
            ly = py(p) + vy / length * 2.2 + 1
            self.font("normal", 6.2, "ink")
            self.text(p[0], lx, ly, align="right" if vx < -0.5 else "left" if vx > 0.5 else "center")

        nx, ny = x + w - 8, y0 + 6
        self.polygon([(nx, ny), (nx - 2, ny + 6), (nx + 2, ny + 6)], fill="ink")
        self.font("bold", 7, "ink")
        self.text("N", nx, ny - 1, align="center")

        nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
        chosen = next((m for m in reversed(nice) if m * scale <= w * 0.32), nice[0])
        bar_len = chosen * scale
        bx, by = x + 5, y0 + h - 6
        self.line(bx, by, bx + bar_len, by, "ink", 0.5)
        self.line(bx, by - 1.2, bx, by + 1.2, "ink", 0.5)
        self.line(bx + bar_len, by - 1.2, bx + bar_len, by + 1.2, "ink", 0.5)
        self.font("normal", 6.8, "ink")
        self.text(f"{chosen} m", bx + bar_len / 2, by - 2, align="center")

    def photo_grid(self, photos, cols=3, cell_h=44):
        """photos = [{data, w, h, caption}] (see image_for_pdf)."""
        gap = 4
        cw = (CONTENT_W - gap * (cols - 1)) / cols
        for i in range(0, len(photos), cols):
            self.ensure(cell_h + 12)
            for c, p in enumerate(photos[i:i + cols]):
                x = MARGIN + c * (cw + gap)
                self.rect(x, self.y, cw, cell_h, fill="paper", radius=1.5)
                s = min((cw - 2) / p["w"], (cell_h - 2) / p["h"])
                iw, ih = p["w"] * s, p["h"] * s
                self.image(p["data"], x + (cw - iw) / 2, self.y + (cell_h - ih) / 2, iw, ih)
                self.font("normal", 7.2, "muted")
                self.text((self.lines(p.get("caption") or "", cw) or [""])[0], x, self.y + cell_h + 3.6)
            self.y += cell_h + 8

    def signatures(self, boxes):
        """Signature boxes side by side. boxes = [{role, name, date}]"""
        gap = 6
        n = len(boxes)
        w = (CONTENT_W - gap * (n - 1)) / n
        h = 34
        self.ensure(h + 8)
        for i, b in enumerate(boxes):
            x = MARGIN + i * (w + gap)
            self.font("bold", 8.5, "ink")
            self.text(b["role"], x, self.y + 3)
            self.rect(x, self.y + 6, w, 22, stroke="muted", radius=1.5, lw=0.25)
            self.font("normal", 7.5, "muted")
            meta = " - ".join(v for v in (b.get("name"), b.get("date")) if v)
            self.text(meta or "Nom, date et signature", x, self.y + 32)
        self.y += h + 4

    def finalize(self):
        """Footer on every page; returns the PDF bytes."""
        total = self.doc.page_count
        for i in range(total):
            self.page = self.doc[i]
            self.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14, "line", 0.3)
            self.font("normal", 7.5, "muted")
            ref = f" - {self.ref}" if self.ref else ""
            self.text(f"Document généré par glbOps le {today_fr()}{ref}", MARGIN, PAGE_H - 9.5)
            self.text(f"Page {i + 1} / {total}", PAGE_W - MARGIN, PAGE_H - 9.5, align="right")
        self.doc.set_metadata({"title": self.title, "creator": "glbOps", "producer": "glbOps"})
        data = self.doc.tobytes(garbage=3, deflate=True)
        self.doc.close()
        return data
