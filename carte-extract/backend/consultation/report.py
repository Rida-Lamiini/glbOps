"""Consultation report PDF: the question asked, the verdict, a plan (browser snapshot or a drawn schematic with
numbered neighbours, scale and north) and the neighbouring projets table, plus the parcel's bornes when known."""

import math

import fitz

from core.pdf_kit import CONTENT_W, MARGIN, PT, Report, image_for_pdf, num, rgb

RELATIONS = {"dans": "Dans", "chevauche": "Chevauche", "mitoyen": "Mitoyen", "proche": "Proche", "titre": "Même titre"}
RELATION_TONE = {"dans": "bad", "chevauche": "bad", "mitoyen": "warn", "titre": "warn"}
STAGES = {"demande": "Demande", "prestation": "Prestation demandée", "affectation": "Affectation terrain", "execution": "Exécution",
          "bureau": "Traitement bureau", "controle": "Contrôle", "livraison": "Livré"}
VERDICT = {"ok": ("good", "Aucun conflit", "Aucun levé existant ne chevauche cette position."),
           "warning": ("warn", "À vérifier", "Des projets existants touchent cette position : contrôlez avant de lancer le travail."),
           "danger": ("bad", "Levé déjà livré", "Un levé livré ou validé couvre déjà cette position : le réutiliser plutôt que d'en refaire un.")}
MAP_H = 92
NICE = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]


def _rings(geom):
    if not geom:
        return []
    t, c = geom["type"], geom["coordinates"]
    if t == "Polygon":
        return [c[0]]
    if t == "MultiPolygon":
        return [p[0] for p in c]
    return []


def _label_disc(r, x, y, text, colour):
    r.circle(x, y, 2.6, colour)
    r.font("bold", 6.5, "white")
    r.text(str(text), x, y + 0.9, align="center")


def _schematic(r, result):
    """North-up plan: search circle and thirds, consulted parcel in black, neighbours numbered like the table."""
    q = result["query"]
    lat0, lng0, radius = q["lat"], q["lng"], q["radius_m"]
    kx, ky = 111320.0 * math.cos(math.radians(lat0)), 110540.0
    x0, y0, w, h = MARGIN, r.y, CONTENT_W, MAP_H
    cx, cy = x0 + w / 2, y0 + h / 2
    # frame the neighbours rather than the whole search circle when they are all close
    far = max([n["distance_m"] for n in result["neighbours"] if n["distance_m"] is not None] + [0])
    view_r = min(radius, max(far * 1.3, math.sqrt(max(q["area_m2"], 0)) * 2.2, 60))
    scale = (h / 2 - 5) / view_r  # mm per metre

    def pt(lng, lat):
        return cx + (lng - lng0) * kx * scale, cy - (lat - lat0) * ky * scale

    r.rect(x0, y0, w, h, fill="surface", stroke="line")
    # faint grid + concentric rings (thirds of the radius, like the on-screen radar)
    for k in range(1, 3):
        x = x0 + w * k / 3
        r.line(x, y0, x, y0 + h, "line", 0.12)
    for f in (1, 2 / 3, 1 / 3):
        r.page.draw_circle(fitz.Point(cx * PT, cy * PT), view_r * f * scale * PT, color=rgb("line"), fill=None, width=0.15 * PT)
    if radius * scale < h / 2:  # the search circle itself, when it fits in the frame
        r.page.draw_circle(fitz.Point(cx * PT, cy * PT), radius * scale * PT, color=rgb("muted"), fill=None, width=0.35 * PT, dashes="[2 2] 0")

    for ref in result.get("reference", []):
        for ring in _rings(ref["geometry"]):
            r.polygon([pt(*p) for p in ring], fill=None, stroke="info", lw=0.25)
    for i, n in enumerate(result["neighbours"], start=1):
        if not n["geometry"]:
            continue
        hot = n["relation"] in ("chevauche", "dans")
        colour = "bad" if hot else "info"
        rings = _rings(n["geometry"])
        for ring in rings:
            r.polygon([pt(*p) for p in ring], fill=None, stroke=colour, lw=0.5)
        if rings:
            xs, ys = zip(*[pt(*p) for p in rings[0]])
            lx, ly = sum(xs) / len(xs), sum(ys) / len(ys)
        elif n["geometry"]["type"] == "Point":
            lx, ly = pt(*n["geometry"]["coordinates"])
        else:
            continue
        if x0 + 3 < lx < x0 + w - 3 and y0 + 3 < ly < y0 + h - 3:
            _label_disc(r, lx, ly, i, colour)
    for ring in _rings(q["geometry"]):
        r.polygon([pt(*p) for p in ring], fill=None, stroke="ink", lw=0.8)
    if q["geometry"]["type"] == "Point":
        r.circle(cx, cy, 1.7, "ink")
        r.circle(cx, cy, 0.7, "white")

    # north arrow
    nx, ny = x0 + w - 8, y0 + 12
    r.polygon([(nx, ny - 6), (nx - 2.2, ny + 1), (nx, ny - 0.5), (nx + 2.2, ny + 1)], fill="ink")
    r.font("bold", 7, "ink")
    r.text("N", nx, ny + 5.2, align="center")
    # scale bar (a round distance, about a fifth of the width)
    metres = next((d for d in NICE if d * scale >= w / 6), NICE[-1])
    bx, by = x0 + 5, y0 + h - 6
    r.line(bx, by, bx + metres * scale, by, "ink", 0.5)
    r.line(bx, by - 1.2, bx, by + 1.2, "ink", 0.5)
    r.line(bx + metres * scale, by - 1.2, bx + metres * scale, by + 1.2, "ink", 0.5)
    r.font("normal", 7, "ink")
    r.text(f"{metres} m", bx + metres * scale / 2, by - 2, align="center")
    r.font("normal", 6.5, "muted")
    r.text(f"Rayon de recherche : {radius:.0f} m" + ("" if radius * scale < h / 2 else " (hors cadre)"), x0 + w - 4, y0 + h - 3.5, align="right")
    r.y += h + 2
    # legend
    r.font("normal", 7.5, "muted")
    lx = x0
    for colour, label in (("ink", "Position / parcelle consultée"), ("bad", "Chevauchement"), ("info", "Projet voisin")):
        r.rect(lx, r.y + 0.4, 3.4, 1.6, fill=colour)
        r.text(label, lx + 5, r.y + 2.1)
        lx += 6 + r.width(label, 7.5)
    r.y += 6


def build_report(result, user_label="", map_png=None, title="", bornes=None, declared_surface_m2=None):
    q = result["query"]
    tone, head, body = VERDICT[result["summary"]["status"]]
    r = Report(
        title="Consultation de position",
        eyebrow="Consultation de position",
        subtitle=title or f"{q['lat']:.6f}, {q['lng']:.6f}" + (f" · {q['titre']}" if q["titre"] else ""),
        ref=user_label,
    )
    r.callout(head, body, tone)
    s = result["summary"]
    r.kpis([
        {"label": "Projets proches", "value": str(s["count"])},
        {"label": "Plus proche", "value": f"{s['nearest_m']:.0f} m" if s["nearest_m"] is not None else "—"},
        {"label": "Chevauchements", "value": str(s["overlapping"]), "tone": "bad" if s["overlapping"] else None},
        {"label": "Déjà livrés", "value": str(s["delivered"]), "tone": "warn" if s["delivered"] else None},
    ])
    facts = [("Position (centre)", f"{q['lat']:.6f}, {q['lng']:.6f}"), ("Rayon de recherche", f"{q['radius_m']:.0f} m"),
             ("Titre foncier", q["titre"] or "—"), ("Surface calculée", f"{num(q['area_m2'], 0)} m²" if q["area_m2"] else "Point")]
    if declared_surface_m2:
        gap = (q["area_m2"] - declared_surface_m2) / declared_surface_m2 * 100
        facts += [("Surface déclarée", f"{num(declared_surface_m2, 0)} m²"), ("Écart", f"{gap:+.1f} %")]
    r.kv(facts, cols=3)
    for a in result["alerts"]:
        r.callout(a["title"], a["message"], "bad" if a["severity"] == "danger" else "warn")

    r.section("Plan")
    img = image_for_pdf(map_png, 1400) if map_png else None
    if img:
        h = min(MAP_H * 1.4, CONTENT_W * img["h"] / img["w"])
        r.ensure(h + 4)
        r.image(img["data"], MARGIN, r.y, CONTENT_W, h)
        r.y += h + 4
    else:
        r.ensure(MAP_H + 14)
        _schematic(r, result)

    r.section("Projets voisins", note=f"{len(result['neighbours'])} dans {q['radius_m']:.0f} m — numéros du plan")
    rows = []
    for i, n in enumerate(result["neighbours"], start=1):
        stage = n["prestations"][0]["stage"] if n["prestations"] else ""
        rows.append([
            str(i),
            {"text": f"{n['label']}\n{n['projet_id'] or 'lot sans projet'}", "bold": True},
            n["client"] or "—",
            {"text": RELATIONS.get(n["relation"], n["relation"]), "tone": RELATION_TONE.get(n["relation"])},
            f"{n['distance_m']:.0f} m {n['direction']}" if n["distance_m"] is not None else "—",
            f"{n['overlap_m2']:.0f} m²" if n["overlap_m2"] else "—",
            {"text": "Livré", "tone": "good", "bold": True} if n["delivered"] else STAGES.get(stage, "—"),
        ])
    r.table([{"label": "N°", "w": 0.8}, {"label": "Projet / titre", "w": 3}, {"label": "Client", "w": 3}, {"label": "Relation", "w": 2},
             {"label": "Distance", "w": 2}, {"label": "En commun", "w": 2}, {"label": "État", "w": 2.4}],
            rows, empty_text="Aucun projet dans ce rayon.")

    if result.get("reference"):
        r.section("Parcelles de référence", note="couche importée, non facturée")
        r.table([{"label": "Parcelle", "w": 3}, {"label": "Couche", "w": 3}, {"label": "Distance", "w": 2}],
                [[x["name"], x["layer"], f"{x['distance_m']:.0f} m {x['direction']}"] for x in result["reference"]])

    if bornes:
        r.section("Bornes de la parcelle consultée", note=f"{len(bornes)} bornes")
        r.table([{"label": "Borne", "w": 1.5}, {"label": "X Lambert", "w": 2.5, "align": "right"}, {"label": "Y Lambert", "w": 2.5, "align": "right"},
                 {"label": "Latitude", "w": 2.5, "align": "right"}, {"label": "Longitude", "w": 2.5, "align": "right"}],
                [[b["name"], num(b["x"]) if b.get("x") is not None else "—", num(b["y"]) if b.get("y") is not None else "—",
                  f"{b['lat']:.6f}", f"{b['lng']:.6f}"] for b in bornes])
    r.paragraph("Résultat indicatif établi à partir des projets et lots enregistrés dans glbOps : il ne remplace pas la vérification "
                "auprès de l'ANCFCC.", size=8, color="muted", style="normal", gap=2)
    return r.finalize()
