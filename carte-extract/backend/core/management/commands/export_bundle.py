from django.core.management.base import BaseCommand

from core.bundle import export_bundle


class Command(BaseCommand):
    help = "Write an update bundle (data + lot geometries + uploaded files) to a .zip file."

    def add_arguments(self, parser):
        parser.add_argument("path")

    def handle(self, *args, path, **options):
        manifest = export_bundle(path)
        self.stdout.write(self.style.SUCCESS(f"Bundle written to {path}"))
        self.stdout.write(str(manifest["counts"]))
