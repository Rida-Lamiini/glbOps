from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("projets", "0004_prestation_stage_since"),
    ]

    operations = [
        migrations.AddField(
            model_name="projet",
            name="version",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
