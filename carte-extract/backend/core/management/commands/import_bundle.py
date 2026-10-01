from django.core.management.base import BaseCommand, CommandError

from core.bundle import BundleError, import_bundle


class Command(BaseCommand):
    help = "Import an update bundle .zip (see export_bundle). Safe to run twice."

    def add_arguments(self, parser):
        parser.add_argument("path")

    def handle(self, *args, path, **options):
        try:
            result = import_bundle(path)
        except BundleError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f"Imported: {result['geometries']} geometries, {result['files']} files"))
