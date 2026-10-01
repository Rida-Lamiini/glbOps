from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_comment_mentions"),
    ]

    operations = [
        migrations.CreateModel(
            name="StoredFile",
            fields=[
                ("name", models.CharField(max_length=500, primary_key=True, serialize=False)),
                ("content", models.BinaryField()),
                ("size", models.PositiveBigIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
