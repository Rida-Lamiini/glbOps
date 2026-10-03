from django.core.management.base import BaseCommand

from cadastre.models import Lot
from cadastre.operations import from_filename


class Command(BaseCommand):
    help = "Fills the operation (MT / MEC / COPRO) of lots that have none, from their source PDF's file name."

    def handle(self, *args, **options):
        done = 0
        for lot in Lot.objects.filter(operation="").exclude(source_pdf_url=""):
            op = from_filename(lot.source_pdf_url)
            if op:
                Lot.objects.filter(pk=lot.pk).update(operation=op)
                done += 1
        self.stdout.write(self.style.SUCCESS(f"{done} lot(s) updated"))
