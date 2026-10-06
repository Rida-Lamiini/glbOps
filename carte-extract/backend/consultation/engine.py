"""The consultation itself: which projets/lots lie near (or on) a position or a parcel, and what to warn about."""

from shapely.geometry import Point, mapping
from shapely.ops import nearest_points

from .dataset import Entry, load_entries, norm_titre
from .geo import (bearing_local, circle_geojson, compass, local_projection, ring_polygon, to_local, route_order,
                  trip_metrics, STOP_MINUTES)

ADJOINING_M = 1.5  # parcels closer than this are mitoyens (surveyed boundaries never match to the centimetre)
DEFAULT_RADIUS_M = 200
MAX_RADIUS_M = 5000


def query_geometry(lat=None, lng=None, ring=None):
    """(shapely geometry in WGS84, centre lat, centre lng) for a point or a ring of (lat, lng)."""
    if ring:
        poly = ring_polygon(ring)
        if poly is not None:
            c = poly.centroid
            return poly, c.y, c.x
        lat, lng = ring[0]
    if lat is None or lng is None:
        raise ValueError("Position manquante.")
    return Point(lng, lat), lat, lng


def _relation(distance, overlap_m2, inside):
    if inside:
        return "dans"
    if overlap_m2 > 0.5:
        return "chevauche"
    if distance <= ADJOINING_M:
        return "mitoyen"
    return "proche"


def _entry_json(e: Entry):
    return {
        "projet_id": e.projet_id, "label": e.label, "client": e.client, "situation": e.situation, "titres": e.titres,
        "geom_kind": e.geom_kind, "geometry": mapping(e.geom) if e.geom is not None else None,
        "delivered": e.delivered, "validated": e.validated, "lots": e.lots, "prestations": e.prestations,
    }


def neighbours(query, lat0, lng0, radius_m, entries, exclude_projet_id=None):
    """Entries within `radius_m` of the query geometry, nearest first, with distance / relation / overlap / bearing."""
    tr = local_projection(lat0, lng0)
    q = to_local(query, tr)
    out = []
    for e in entries:
        if e.geom is None or (exclude_projet_id and e.projet_id == exclude_projet_id):
            continue
        g = to_local(e.geom, tr)
        d = q.distance(g)
        if d > radius_m:
            continue
        overlap = q.intersection(g).area if q.area > 0 and g.area > 0 else 0.0
        inside = (q.geom_type == "Point" and g.area > 0 and g.contains(q)) or (q.area > 0 and g.area > 0 and g.contains(q))
        a, b = nearest_points(q, g) if d > 0 else (q.centroid, g.centroid)
        bearing = bearing_local(b.x - a.x, b.y - a.y)
        item = _entry_json(e)
        item.update({
            "distance_m": round(d, 1), "relation": _relation(d, overlap, inside),
            "overlap_m2": round(overlap, 1), "bearing": round(bearing), "direction": compass(bearing),
            "overlap_pct": round(100 * overlap / q.area, 1) if q.area > 0 else 0.0,
        })
        out.append(item)
    out.sort(key=lambda x: (x["distance_m"], -x["overlap_m2"]))
    return out


def alerts_for(items, titre=None, query_area=0.0):
    """Warnings, worst first: same titre already surveyed, delivered work covering the same ground, overlaps."""
    alerts = []
    wanted = norm_titre(titre)
    for it in items:
        same_titre = bool(wanted) and wanted in it["titres"]
        covered = it["relation"] in ("chevauche", "dans") and (it["overlap_pct"] >= 20 or it["relation"] == "dans")
        if not (same_titre or covered):
            continue
        final = it["delivered"] or it["validated"]
        if same_titre:
            alerts.append({
                "kind": "same_titre", "severity": "danger" if final else "warning", "projet_id": it["projet_id"],
                "title": f"Titre {titre} déjà traité" + (" et livré" if it["delivered"] else ""),
                "message": f"Le projet {it['label']} ({it['client']}) porte déjà ce titre foncier : réutiliser le levé existant plutôt que d'en refaire un.",
            })
        elif covered:
            alerts.append({
                "kind": "overlap", "severity": "danger" if final else "warning", "projet_id": it["projet_id"],
                "title": "Chevauchement avec un levé existant",
                "message": f"{it['label']} ({it['client']}) recouvre {it['overlap_m2']:.0f} m² "
                           f"({it['overlap_pct']:.0f} % de la parcelle consultée)" + (" — livré." if it["delivered"] else "."),
            })
    alerts.sort(key=lambda a: (a["severity"] != "danger", a["kind"] != "same_titre"))
    return alerts


def consult(user, *, lat=None, lng=None, ring=None, titre=None, radius_m=DEFAULT_RADIUS_M, exclude_projet_id=None, entries=None):
    radius_m = max(10, min(float(radius_m or DEFAULT_RADIUS_M), MAX_RADIUS_M))
    geom, lat0, lng0 = query_geometry(lat, lng, ring)
    entries = entries if entries is not None else load_entries(user)
    items = neighbours(geom, lat0, lng0, radius_m, entries, exclude_projet_id)
    # a titre match counts even when it lies outside the radius (the same lot filed elsewhere)
    if titre:
        wanted, present = norm_titre(titre), {i["projet_id"] for i in items}
        for e in entries:
            if wanted in e.titres and e.projet_id not in present and e.projet_id != exclude_projet_id:
                far = _entry_json(e)
                far.update({"distance_m": None, "relation": "titre", "overlap_m2": 0, "overlap_pct": 0, "bearing": None, "direction": ""})
                items.append(far)
    tr = local_projection(lat0, lng0)
    area = to_local(geom, tr).area
    alerts = alerts_for(items, titre, area)
    return {
        "query": {"lat": lat0, "lng": lng0, "titre": titre or "", "radius_m": radius_m, "area_m2": round(area, 1),
                  "geometry": mapping(geom), "circle": circle_geojson(lat0, lng0, radius_m)},
        "neighbours": items,
        "alerts": alerts,
        "summary": {"count": len(items), "nearest_m": next((i["distance_m"] for i in items if i["distance_m"] is not None), None),
                    "overlapping": sum(1 for i in items if i["relation"] in ("chevauche", "dans")),
                    "adjoining": sum(1 for i in items if i["relation"] == "mitoyen"),
                    "delivered": sum(1 for i in items if i["delivered"]),
                    "status": "danger" if any(a["severity"] == "danger" for a in alerts) else "warning" if alerts else "ok"},
    }


def plan_route(start, stops):
    """Order `stops` ([{label, lat, lng, …}]) as a trip from `start` ({lat, lng}); returns legs and totals."""
    pts = [(start["lat"], start["lng"])] + [(s["lat"], s["lng"]) for s in stops]
    order = route_order(pts)
    legs, total = trip_metrics(pts, order)
    visit = [{**stops[i - 1], "order": n} for n, i in enumerate(order[1:], start=1)]
    drive = sum(l["minutes"] for l in legs)
    return {"stops": visit, "legs": legs, "road_km": round(total / 1000, 1), "drive_minutes": drive,
            "total_minutes": drive + STOP_MINUTES * len(visit)}


def layer_neighbours(query, lat0, lng0, radius_m):
    """Reference-layer parcels (imported cadastre neighbours) near the query — context, not projets."""
    from shapely.geometry import shape

    from .models import ReferenceParcel

    tr = local_projection(lat0, lng0)
    q = to_local(query, tr)
    out = []
    for p in ReferenceParcel.objects.select_related("layer"):
        g = to_local(shape(p.geometry), tr)
        d = q.distance(g)
        if d > radius_m:
            continue
        a, b = nearest_points(q, g) if d > 0 else (q.centroid, g.centroid)
        bearing = bearing_local(b.x - a.x, b.y - a.y)
        out.append({"id": p.id, "name": p.name, "titre": p.titre, "layer": p.layer.name, "distance_m": round(d, 1),
                    "direction": compass(bearing), "geometry": mapping(shape(p.geometry))})
    out.sort(key=lambda x: x["distance_m"])
    return out
