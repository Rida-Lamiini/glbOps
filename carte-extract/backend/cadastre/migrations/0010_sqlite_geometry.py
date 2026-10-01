"""SQLite only: the polygon/centroid columns as GeoJSON text (PostgreSQL got PostGIS ones in 0002)."""

from django.db import migrations


def forward(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return
    schema_editor.execute("ALTER TABLE cadastre_lots ADD COLUMN polygon text")
    schema_editor.execute("ALTER TABLE cadastre_lots ADD COLUMN centroid text")


class Migration(migrations.Migration):
    dependencies = [
        ("cadastre", "0009_lot_rotation"),
    ]

    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
