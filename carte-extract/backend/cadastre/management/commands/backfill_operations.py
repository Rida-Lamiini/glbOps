from django.core.management.base import BaseCommand

from cadastre.models import Lot
from cadastre.operations import from_filename, sync_all


class Command(BaseCommand):
    help = "Fills the operation (MT / MEC / COPRO) of unlinked lots from their source PDF's file name, and re-syncs linked lots from their projet's prestations."

    def handle(self, *args, **options):
        done = 0
        for lot in Lot.objects.filter(operation="", projet=None).exclude(source_pdf_url=""):
            op = from_filename(lot.source_pdf_url)
            if op:
                Lot.objects.filter(pk=lot.pk).update(operation=op)
                done += 1
        synced = sync_all()  # lots linked to a projet follow that projet's prestations
        self.stdout.write(self.style.SUCCESS(f"{done} lot(s) filled from the file name, {synced} lot(s) re-synced from their projet's prestations"))
