import datetime

from django.db import migrations, models


def _parse_exec(value):
    """``date_debut_exec`` is free text: "18/08/2026", "18/08/2026 16:30" or an ISO date."""
    text = (value or "").strip()[:10]
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def backfill_stage_since(apps, schema_editor):
    """Best guess of when each existing prestation entered its current stage, from the dates
    already recorded for that stage. Left null when there is none (then no SLA is shown)."""
    Prestation = apps.get_model("projets", "Prestation")
    for p in Prestation.objects.all():
        entered = {
            "demande": p.date_debut_demande,
            "prestation": p.date_fin_demande,
            "affectation": p.date_fin_demande,
            "execution": _parse_exec(p.date_debut_exec),
            "bureau": p.date_debut_bureau,
            "controle": p.date_debut_controle,
            "livraison": p.date_livraison,
        }.get(p.stage)
        if entered:
            p.stage_since = datetime.datetime.combine(entered, datetime.time(8, 0), tzinfo=datetime.timezone.utc)
            p.save(update_fields=["stage_since"])


class Migration(migrations.Migration):

    dependencies = [
        ('projets', '0003_reprogrammation_en_attente'),
    ]

    operations = [
        migrations.AddField(
            model_name='prestation',
            name='stage_since',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_stage_since, migrations.RunPython.noop),
    ]
