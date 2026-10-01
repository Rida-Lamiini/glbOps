"""Raw-SQL access to the PostGIS geometry columns on ``cadastre_lots``.

The ``polygon`` and ``centroid`` columns are real PostGIS
``geometry(..., 4326)`` columns (added in migration 0002), but they are not
declared on the Django model: going through GeoDjango would mean installing
GDAL/GEOS system libraries everywhere the project runs, and nothing here
needs ORM-level spatial querying — every read just hands GeoJSON to the
frontend. Switching to ``django.contrib.gis`` later is a model change only;
the columns are already the right type and are spatially indexed.

Values are always passed as query parameters, never string-concatenated into
the SQL.
"""

import json
import math

from django.db import connection


def _sqlite() -> bool:
    return connection.vendor == "sqlite"


def _sqlite_id(value) -> str:
    """SQLite keeps a UUID as 32 hex characters (no dashes)."""
    return str(value).replace("-", "")


def _uuid_str(value) -> str:
    text = str(value)
    if len(text) == 32:
        return f"{text[:8]}-{text[8:12]}-{text[12:16]}-{text[16:20]}-{text[20:]}"
    return text


def _ring_geojson(ring: list[tuple[float, float]]) -> dict:
    return {"type": "Polygon", "coordinates": [[[lng, lat] for lat, lng in _close_ring(ring)]]}


def _distance_to_polygon_m(lat: float, lng: float, polygon: dict) -> float:
    """Metres from a point to a GeoJSON polygon (0 when inside) — local flat-earth approximation."""
    kx = 111320.0 * math.cos(math.radians(lat))
    ky = 110540.0
    ring = [((x - lng) * kx, (y - lat) * ky) for x, y in polygon["coordinates"][0]]
    inside = False
    best = float("inf")
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > 0) != (y2 > 0) and x1 + (0 - y1) * (x2 - x1) / (y2 - y1) > 0:
            inside = not inside
        dx, dy = x2 - x1, y2 - y1
        length2 = dx * dx + dy * dy
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, -(x1 * dx + y1 * dy) / length2))
        best = min(best, math.hypot(x1 + t * dx, y1 + t * dy))
    return 0.0 if inside else best


def _close_ring(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not ring:
        return ring
    if ring[0] == ring[-1]:
        return ring
    return [*ring, ring[0]]


def _ring_to_wkt(ring: list[tuple[float, float]]) -> str:
    """WKT POLYGON from a list of (lat, lng) pairs — WKT is x y, so lng first."""
    closed = _close_ring(ring)
    pairs = ", ".join(f"{lng} {lat}" for lat, lng in closed)
    return f"POLYGON(({pairs}))"


def _point_to_wkt(point: tuple[float, float]) -> str:
    lat, lng = point
    return f"POINT({lng} {lat})"


def set_lot_geometry(
    lot_id, ring_lat_lng: list[tuple[float, float]], centroid_lat_lng: tuple[float, float]
) -> None:
    if _sqlite():
        centroid = {"type": "Point", "coordinates": [centroid_lat_lng[1], centroid_lat_lng[0]]}
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE cadastre_lots SET polygon = %s, centroid = %s WHERE id = %s",
                [json.dumps(_ring_geojson(ring_lat_lng)), json.dumps(centroid), _sqlite_id(lot_id)],
            )
        return
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE cadastre_lots
            SET polygon = ST_SetSRID(ST_GeomFromText(%s), 4326),
                centroid = ST_SetSRID(ST_GeomFromText(%s), 4326)
            WHERE id = %s
            """,
            [_ring_to_wkt(ring_lat_lng), _point_to_wkt(centroid_lat_lng), str(lot_id)],
        )


def get_lot_geometry_geojson(lot_id) -> dict | None:
    """``{"polygon": <GeoJSON Polygon>, "centroid": <GeoJSON Point>}``, or None."""
    if _sqlite():
        with connection.cursor() as cursor:
            cursor.execute("SELECT polygon, centroid FROM cadastre_lots WHERE id = %s", [_sqlite_id(lot_id)])
            row = cursor.fetchone()
        if not row or not row[0] or not row[1]:
            return None
        return {"polygon": json.loads(row[0]), "centroid": json.loads(row[1])}
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT ST_AsGeoJSON(polygon), ST_AsGeoJSON(centroid)
            FROM cadastre_lots
            WHERE id = %s
            """,
            [str(lot_id)],
        )
        row = cursor.fetchone()
    if not row or not row[0] or not row[1]:
        return None
    return {"polygon": json.loads(row[0]), "centroid": json.loads(row[1])}


def list_all_lot_polygons_geojson() -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT id, titre_foncier, propriete_dite, {"polygon" if _sqlite() else "ST_AsGeoJSON(polygon)"}, projet_id
            FROM cadastre_lots
            WHERE polygon IS NOT NULL
            ORDER BY created_at DESC
            """
        )
        rows = cursor.fetchall()
    return [
        {
            "id": _uuid_str(row[0]),
            "titre_foncier": row[1],
            "propriete_dite": row[2],
            "polygon": json.loads(row[3]),
            "projet_id": row[4],
        }
        for row in rows
        if row[3]
    ]


def find_lots_near(lat: float, lng: float, radius_m: float) -> list[dict]:
    """Lots whose polygon lies within ``radius_m`` metres of a point, nearest first.

    Uses ``geography`` casts so the radius is real metres, not degrees. Returns
    ``[{"id", "distance_m"}]`` — callers load the rows they need through the ORM.
    """
    if _sqlite():
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, polygon FROM cadastre_lots WHERE polygon IS NOT NULL")
            rows = cursor.fetchall()
        found = []
        for lot_id, polygon in rows:
            d = _distance_to_polygon_m(lat, lng, json.loads(polygon))
            if d <= radius_m:
                found.append({"id": _uuid_str(lot_id), "distance_m": round(d, 1)})
        return sorted(found, key=lambda x: x["distance_m"])
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, ST_Distance(polygon::geography, pt.g) AS d
            FROM cadastre_lots,
                 (SELECT ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography AS g) AS pt
            WHERE polygon IS NOT NULL
              AND ST_DWithin(polygon::geography, pt.g, %s)
            ORDER BY d
            """,
            [lng, lat, radius_m],
        )
        return [{"id": str(row[0]), "distance_m": round(float(row[1]), 1)} for row in cursor.fetchall()]


def copy_lot_geometry(source_id, target_id) -> None:
    if _sqlite():
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE cadastre_lots SET polygon = (SELECT polygon FROM cadastre_lots WHERE id = %s),"
                " centroid = (SELECT centroid FROM cadastre_lots WHERE id = %s) WHERE id = %s",
                [_sqlite_id(source_id), _sqlite_id(source_id), _sqlite_id(target_id)],
            )
        return
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE cadastre_lots AS t
            SET polygon = s.polygon, centroid = s.centroid
            FROM cadastre_lots AS s
            WHERE s.id = %s AND t.id = %s
            """,
            [str(source_id), str(target_id)],
        )


def set_lot_geometry_geojson(lot_id, polygon: dict, centroid: dict) -> None:
    """Writes a lot's geometry straight from GeoJSON (used when importing an update bundle)."""
    if _sqlite():
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE cadastre_lots SET polygon = %s, centroid = %s WHERE id = %s",
                [json.dumps(polygon), json.dumps(centroid), _sqlite_id(lot_id)],
            )
        return
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE cadastre_lots
            SET polygon = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                centroid = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)
            WHERE id = %s
            """,
            [json.dumps(polygon), json.dumps(centroid), str(lot_id)],
        )
