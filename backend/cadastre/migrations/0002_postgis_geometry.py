"""Adds the PostGIS geometry columns for a lot's polygon and centroid.

These are not declared on the model: they are read and written through raw
SQL in ``cadastre/db/geometry.py``, so the project does not need GeoDjango
(and its GDAL/GEOS system libraries) installed just to store and serve them.
See that module for the rationale and for how to migrate to
``django.contrib.gis`` later.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("cadastre", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="CREATE EXTENSION IF NOT EXISTS postgis;",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql=[
                "ALTER TABLE cadastre_lots ADD COLUMN polygon geometry(Polygon, 4326);",
                "ALTER TABLE cadastre_lots ADD COLUMN centroid geometry(Point, 4326);",
                "CREATE INDEX cadastre_lots_polygon_gix ON cadastre_lots USING GIST (polygon);",
                "CREATE INDEX cadastre_lots_centroid_gix ON cadastre_lots USING GIST (centroid);",
            ],
            reverse_sql=[
                "DROP INDEX IF EXISTS cadastre_lots_centroid_gix;",
                "DROP INDEX IF EXISTS cadastre_lots_polygon_gix;",
                "ALTER TABLE cadastre_lots DROP COLUMN IF EXISTS centroid;",
                "ALTER TABLE cadastre_lots DROP COLUMN IF EXISTS polygon;",
            ],
        ),
    ]
