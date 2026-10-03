from django.apps import AppConfig


class CadastreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "cadastre"
    verbose_name = "Cadastre (OCR)"

    def ready(self):
        from . import signals  # noqa: F401
