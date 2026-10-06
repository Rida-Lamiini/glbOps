from django.apps import AppConfig


class ConsultationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "consultation"
    verbose_name = "Consultation de position"

    def ready(self):
        from . import signals  # noqa: F401
