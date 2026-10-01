import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cadastre", "0002_postgis_geometry"),
    ]

    operations = [
        migrations.AddField(
            model_name="lot",
            name="derive_de",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name="copies", to="cadastre.lot",
            ),
        ),
        migrations.AlterField(
            model_name="lot",
            name="titre_foncier",
            field=models.CharField(db_index=True, max_length=100),
        ),
        migrations.AddConstraint(
            model_name="lot",
            constraint=models.UniqueConstraint(
                condition=models.Q(("projet__isnull", False)),
                fields=("titre_foncier", "projet"),
                name="unique_titre_per_projet",
            ),
        ),
    ]
