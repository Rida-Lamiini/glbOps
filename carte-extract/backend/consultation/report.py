"""Consultation report PDF: the question asked, the verdict, a map (browser snapshot or a schematic plan) and the
neighbouring projets table."""

from core.pdf_kit import CONTENT_W, MARGIN, Report, image_for_pdf, num

RELATIONS = {"dans": "Dans", "chevauche": "Chevauche", "mitoyen": "Mitoyen", "proche": "Proche", "titre": "Même titre"}
VERDICT = {"ok": ("good", "Aucun conflit", "Aucun projet ne chevauche cette position."),
           "warning": ("warn", "À vérifier", "Des projets existants touchent cette position."),
           "danger": ("bad", "Levé déjà livré", "Un levé livré ou validé couvre déjà cette position : le réutiliser.")}
MAP_H = 95


def _schematic(r, result):
    """A north-up plan of the query and its neighbours when no map snapshot was supplied."""
    q = result["query"]
    lat0, lng0 = q["lat"], q["lng"]
    import math

    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    radius = q["radius_m"]
    scale = (MAP_H / 2 - 4) / max(radius, 1)
    cx, cy = MARGIN + CONTENT_W / 2, r.y + MAP_H / 2

    def pt(lng, lat):
        return cx + (lng - lng0) * kx * scale, cy - (lat - lat0) * ky * scale

    def rings(geom):
        if not geom:
            return []
        t, c = geom["type"], geom["coordinates"]
        if t == "Polygon":
            return [c[0]]
        if t == "MultiPolygon":
            return [p[0] for p in c]
        return []

    r.rect(MARGIN, r.y, CONTENT_W, MAP_H, fill="surface", stroke="line")
    for n in result["neighbours"]:
        colour = "bad" if n["relation"] in ("chevauche", "dans") else "info"
        shapes = rings(n["geometry"])
        for ring in shapes:
            r.polygon([pt(x, y) for x, y in ring], fill=None, stroke=colour, lw=0.4)
        if not shapes and n["geometry"] and n["geometry"]["type"] == "Point":
            x, y = pt(*n["geometry"]["coordinates"])
            r.circle(x, y, 1.2, colour)
    for ring in rings(q["geometry"]):
        r.polygon([pt(x, y) for x, y in ring], fill=None, stroke="ink", lw=0.7)
    if q["geometry"]["type"] == "Point":
        r.circle(cx, cy, 1.6, "ink")
    r.font("normal", 7, "muted")
    r.text("N ↑   cercle de recherche : %d m" % radius, MARGIN + 2, r.y + 5)
    r.y += MAP_H + 4


def build_report(result, user_label="", map_png=None, title=""):
    q = result["query"]
    tone, head, body = VERDICT[result["summary"]["status"]]
    r = Report(
        title="Consultation de position",
        eyebrow="Consultation de position",
        subtitle=title or f"{q['lat']:.6f}, {q['lng']:.6f}" + (f" · {q['titre']}" if q["titre"] else ""),
        ref=user_label,
    )
    r.section("Résultat")
    r.callout(head, body, tone)
    s = result["summary"]
    r.kpis([
        {"label": "Projets proches", "value": str(s["count"])},
        {"label": "Plus proche", "value": f"{s['nearest_m']:.0f} m" if s["nearest_m"] is not None else "—"},
        {"label": "Chevauchements", "value": str(s["overlapping"])},
        {"label": "Livrés", "value": str(s["delivered"])},
    ])
    r.kv([
        ("Position", f"{q['lat']:.6f}, {q['lng']:.6f}"),
        ("Rayon de recherche", f"{q['radius_m']:.0f} m"),
        ("Titre foncier", q["titre"] or "—"),
        ("Surface consultée", f"{num(q['area_m2'], 0)} m²" if q["area_m2"] else "Point"),
    ])
    for a in result["alerts"]:
        r.callout(a["title"], a["message"], "bad" if a["severity"] == "danger" else "warn")
    r.section("Plan")
    r.ensure(MAP_H + 6)
    img = image_for_pdf(map_png, 1400) if map_png else None
    if img:
        h = min(MAP_H * 1.6, CONTENT_W * img["h"] / img["w"])
        r.ensure(h + 4)
        r.image(img["data"], MARGIN, r.y, CONTENT_W, h)
        r.y += h + 4
    else:
        _schematic(r, result)
    r.section("Projets voisins", note=f"{len(result['neighbours'])} dans {q['radius_m']:.0f} m")
    rows = []
    for n in result["neighbours"]:
        rows.append([
            n["label"], n["client"],
            RELATIONS.get(n["relation"], n["relation"]),
            f"{n['distance_m']:.0f} m {n['direction']}" if n["distance_m"] is not None else "—",
            f"{n['overlap_m2']:.0f} m²" if n["overlap_m2"] else "—",
            {"text": "Livré", "tone": "good"} if n["delivered"] else (n["prestations"][0]["stage"] if n["prestations"] else "—"),
        ])
    r.table([{"label": "Projet / titre", "w": 3}, {"label": "Client", "w": 3}, {"label": "Relation", "w": 2},
             {"label": "Distance", "w": 2}, {"label": "Recouvrement", "w": 2}, {"label": "État", "w": 2}],
            rows, empty_text="Aucun projet dans ce rayon.")
    return r.finalize()
