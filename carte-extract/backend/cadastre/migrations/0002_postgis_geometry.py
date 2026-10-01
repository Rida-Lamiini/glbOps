"""Adds the geometry columns for a lot's polygon and centroid.

On PostgreSQL these are real PostGIS ``geometry(..., 4326)`` columns; on SQLite (the
standalone .exe) they are plain TEXT columns holding GeoJSON (see 0010_sqlite_geometry). They are not declared on the
model: they are read and written through raw SQL in ``cadastre/db/geometry.py``, so the
project does not need GeoDjango (and its GDAL/GEOS system libraries) installed.
"""

from django.db import migrations

POSTGIS_FORWARD = [
    "CREATE EXTENSION IF NOT EXISTS postgis;",
    "ALTER TABLE cadastre_lots ADD COLUMN polygon geometry(Polygon, 4326);",
    "ALTER TABLE cadastre_lots ADD COLUMN centroid geometry(Point, 4326);",
    "CREATE INDEX cadastre_lots_polygon_gix ON cadastre_lots USING GIST (polygon);",
    "CREATE INDEX cadastre_lots_centroid_gix ON cadastre_lots USING GIST (centroid);",
]
POSTGIS_BACKWARD = [
    "DROP INDEX IF EXISTS cadastre_lots_centroid_gix;",
    "DROP INDEX IF EXISTS cadastre_lots_polygon_gix;",
    "ALTER TABLE cadastre_lots DROP COLUMN IF EXISTS centroid;",
    "ALTER TABLE cadastre_lots DROP COLUMN IF EXISTS polygon;",
]


def forward(apps, schema_editor):
    # SQLite: the TEXT columns are added by 0010_sqlite_geometry, after the later migrations that
    # rebuild the table (SQLite rebuilds drop columns the model doesn't declare).
    if schema_editor.connection.vendor == "sqlite":
        return
    for sql in POSTGIS_FORWARD:
        schema_editor.execute(sql)


def backward(apps, schema_editor):
    if schema_editor.connection.vendor == "sqlite":
        return
    for sql in POSTGIS_BACKWARD:
        schema_editor.execute(sql)


class Migration(migrations.Migration):
    dependencies = [
        ("cadastre", "0001_initial"),
    ]

    operations = [migrations.RunPython(forward, backward)]
