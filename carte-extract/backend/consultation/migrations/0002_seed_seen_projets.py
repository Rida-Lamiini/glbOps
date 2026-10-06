from django.db import migrations


def seed(apps, schema_editor):
    """Projets that exist when the feature arrives are not 'new': only later ones raise proximity notifications."""
    Projet = apps.get_model("projets", "Projet")
    Seen = apps.get_model("consultation", "SeenProjet")
    Seen.objects.bulk_create([Seen(projet_id=pid, geom_kind="") for pid in Projet.objects.values_list("id", flat=True)], ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [
        ("consultation", "0001_initial"),
        ("projets", "0001_initial"),
    ]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
