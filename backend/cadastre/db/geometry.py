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

from django.db import connection


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
            """
            SELECT id, titre_foncier, propriete_dite, ST_AsGeoJSON(polygon)
            FROM cadastre_lots
            WHERE polygon IS NOT NULL
            ORDER BY created_at DESC
            """
        )
        rows = cursor.fetchall()
    return [
        {
            "id": str(row[0]),
            "titre_foncier": row[1],
            "propriete_dite": row[2],
            "polygon": json.loads(row[3]),
        }
        for row in rows
        if row[3]
    ]


def find_lots_near(lat: float, lng: float, radius_m: float) -> list[dict]:
    """Lots whose polygon lies within ``radius_m`` metres of a point, nearest first.

    Uses ``geography`` casts so the radius is real metres, not degrees. Returns
    ``[{"id", "distance_m"}]`` — callers load the rows they need through the ORM.
    """
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
