from django.db import migrations, models


def add_column(apps, schema_editor):
    # Plain ADD COLUMN on both databases: on SQLite an AddField would rebuild the table and drop
    # the raw polygon/centroid columns (see 0010_sqlite_geometry).
    schema_editor.execute("ALTER TABLE cadastre_lots ADD COLUMN operation varchar(60) NOT NULL DEFAULT ''")


def drop_column(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        schema_editor.execute("ALTER TABLE cadastre_lots DROP COLUMN operation")


class Migration(migrations.Migration):
    dependencies = [
        ("cadastre", "0011_lot_version"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(add_column, drop_column)],
            state_operations=[
                migrations.AddField(
                    model_name="lot",
                    name="operation",
                    field=models.CharField(blank=True, default="", max_length=60),
                ),
            ],
        ),
    ]
