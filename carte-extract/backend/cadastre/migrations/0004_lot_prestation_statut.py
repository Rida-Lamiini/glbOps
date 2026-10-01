import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cadastre", "0003_lot_reuse"),
        ("projets", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="lot", name="prestation",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="lots_cadastraux", to="projets.prestation"),
        ),
        migrations.AddField(
            model_name="lot", name="created_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="+", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="lot", name="statut",
            field=models.CharField(choices=[("brouillon", "Brouillon"), ("verifie", "Vérifié"), ("valide", "Validé")],
                                   default="brouillon", max_length=12),
        ),
        migrations.AddField(
            model_name="lot", name="statut_par",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="+", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="lot", name="statut_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
