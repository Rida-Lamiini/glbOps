from django.db import migrations, models


def add_column(apps, schema_editor):
    # Plain ADD COLUMN on both databases: on SQLite an AddField would rebuild the table and drop
    # the raw polygon/centroid columns (see 0010_sqlite_geometry).
    schema_editor.execute("ALTER TABLE cadastre_lots ADD COLUMN version integer NOT NULL DEFAULT 0")


def drop_column(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        schema_editor.execute("ALTER TABLE cadastre_lots DROP COLUMN version")


class Migration(migrations.Migration):
    dependencies = [
        ("cadastre", "0010_sqlite_geometry"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(add_column, drop_column)],
            state_operations=[
                migrations.AddField(
                    model_name="lot",
                    name="version",
                    field=models.PositiveIntegerField(default=0),
                ),
            ],
        ),
    ]
