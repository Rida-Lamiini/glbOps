"""Geometry helpers for the consultation tools: a local metric projection (so distances are in metres),
bearings, circles and a small route optimiser. Everything public/private is pure functions over shapely
geometries stored in WGS84 as (lng, lat)."""

import math

from pyproj import Transformer
from shapely.geometry import Polygon
from shapely.ops import transform
from shapely.validation import make_valid

EARTH_M = 6371008.8
_DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
_PROJ = {}


def local_projection(lat0, lng0):
    """WGS84 -> azimuthal equidistant metres centred on (lat0, lng0): exact distances from the centre,
    and accurate for the few kilometres around it that a consultation looks at."""
    key = (round(lat0, 3), round(lng0, 3))
    tr = _PROJ.get(key)
    if tr is None:
        if len(_PROJ) > 256:
            _PROJ.clear()
        tr = Transformer.from_crs("EPSG:4326", f"+proj=aeqd +lat_0={lat0} +lon_0={lng0} +datum=WGS84 +units=m +no_defs", always_xy=True)
        _PROJ[key] = tr
    return tr


def to_local(geom, tr):
    return transform(tr.transform, geom)


def bearing_local(dx, dy):
    """Compass bearing (degrees clockwise from north) of a local (east, north) offset."""
    return math.degrees(math.atan2(dx, dy)) % 360


def compass(bearing):
    return _DIRS[int((bearing + 22.5) // 45) % 8]


def haversine_m(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_M * math.asin(math.sqrt(a))


def circle_geojson(lat, lng, radius_m, n=72):
    """A GeoJSON Polygon approximating the circle of `radius_m` around a point (for drawing the search radius)."""
    ring = []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        dlat = (radius_m * math.cos(a)) / 111320.0
        dlng = (radius_m * math.sin(a)) / (111320.0 * max(math.cos(math.radians(lat)), 1e-6))
        ring.append([round(lng + dlng, 7), round(lat + dlat, 7)])
    return {"type": "Polygon", "coordinates": [ring]}


def largest_polygon(geom):
    """The biggest polygon of any geometry (MultiPolygon / GeometryCollection after a repair), or None."""
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type == "Polygon":
        return geom
    parts = [g for g in getattr(geom, "geoms", []) if g.geom_type in ("Polygon", "MultiPolygon")]
    polys = []
    for p in parts:
        polys.extend(p.geoms if p.geom_type == "MultiPolygon" else [p])
    return max(polys, key=lambda p: p.area) if polys else None


def ring_polygon(ring_lat_lng):
    """A valid shapely Polygon from [(lat, lng), …] (repaired if the ring crosses itself), or None."""
    pts = [(lng, lat) for lat, lng in ring_lat_lng]
    if len(pts) < 3:
        return None
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = largest_polygon(make_valid(poly))
    return poly if poly is not None and not poly.is_empty and poly.area > 0 else None


def planar_area_m2(xy):
    """Shoelace area of [(x, y), …] in metres — used with Lambert coordinates, which are already metric."""
    n = len(xy)
    if n < 3:
        return 0.0
    s = sum(xy[i][0] * xy[(i + 1) % n][1] - xy[(i + 1) % n][0] * xy[i][1] for i in range(n))
    return abs(s) / 2


# ---------------------------------------------------------------------------------------------------- route
ROAD_FACTOR = 1.3  # straight-line distance -> a typical road distance in town
SPEED_KMH = 30.0
STOP_MINUTES = 20


def _path_len(order, dist):
    return sum(dist[a][b] for a, b in zip(order, order[1:]))


def route_order(points):
    """Visit order for an open trip. points[0] is the start (fixed); the rest are (lat, lng) stops.
    Nearest-neighbour, then 2-opt until no swap shortens it. Returns the visiting order as indexes into `points`."""
    n = len(points)
    if n <= 2:
        return list(range(n))
    dist = [[haversine_m(*points[i], *points[j]) for j in range(n)] for i in range(n)]
    order, left = [0], set(range(1, n))
    while left:
        nxt = min(left, key=lambda j: dist[order[-1]][j])
        order.append(nxt)
        left.remove(nxt)
    improved = True
    while improved:
        improved = False
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                candidate = order[:i] + order[i:j + 1][::-1] + order[j + 1:]
                if _path_len(candidate, dist) + 1e-6 < _path_len(order, dist):
                    order, improved = candidate, True
    return order


def trip_metrics(points, order):
    """Per-leg straight-line metres, with the road estimate and driving time for each leg and for the whole trip."""
    legs, total = [], 0.0
    for a, b in zip(order, order[1:]):
        d = haversine_m(*points[a], *points[b]) * ROAD_FACTOR
        total += d
        legs.append({"from": a, "to": b, "road_m": round(d), "minutes": round(d / 1000 / SPEED_KMH * 60)})
    return legs, total
