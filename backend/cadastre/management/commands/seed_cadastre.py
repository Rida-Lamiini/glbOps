"""Seeds the reference lot the OCR heuristics were tuned against.

Lot 533 (Titre foncier 49539, "SAPINO 533"). Aggregate figures (surface,
correction Lambert, distance-check deltas, reference point) come from the
source document; the individual borne Lambert X/Y below are illustrative
values fitted to reproduce those documented totals, since per-borne
coordinates weren't provided.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from ...db.geometry import set_lot_geometry
from ...geo.build_lot import build_lot_geometry
from ...models import Borne, DistanceCheck, Lot, ReferencePoint

TITRE_FONCIER = "49539"

# Base offset places the lot ~290 m from the "Biocodex Maroc" reference point
# (Lambert X≈297808, Y≈309636) rather than at an arbitrary origin.
BASE_X = 297558.0
BASE_Y = 309486.0

BORNES = [
    ("B3452", 0, 0.0, 0.0),
    ("B3453bis", 1, 42.0, -3.5),
    ("B3453", 2, 85.0, 0.0),
    ("B3454", 3, 104.0, 45.0),
    ("B3455", 4, 104.0, 105.0),
    ("B3456", 5, 55.0, 109.377),
    ("B3457", 6, 15.0, 105.0),
    ("B3458", 7, 0.0, 60.0),
    ("B3451bis", 8, 0.0, 25.0),
]

DISTANCE_CHECKS = [
    ("B3452-B3453", 84.97),
    ("B3452-B3454", 113.35),
    ("B3452-B3455", 147.82),
    ("B3452-B3456", 122.4),
    ("B3452-B3457", 106.1),
    ("B3452-B3458", 59.96),
]

REFERENCE_POINTS = [("Biocodex Maroc", 33.3653297, -7.5719223)]


class Command(BaseCommand):
    help = "Seeds the reference cadastral lot (Titre foncier 49539, SAPINO 533)."

    def handle(self, *args, **options):
        if Lot.objects.filter(titre_foncier=TITRE_FONCIER).exists():
            self.stdout.write(f"Lot 533 (Titre {TITRE_FONCIER}) existe déjà — rien à faire.")
            return

        bornes_input = [
            {"name": name, "sequence": seq, "x_lambert": BASE_X + dx, "y_lambert": BASE_Y + dy}
            for name, seq, dx, dy in BORNES
        ]
        distance_checks_input = [
            {"segment_label": label, "croquis_m": croquis} for label, croquis in DISTANCE_CHECKS
        ]
        reference_points_input = [
            {"label": label, "lat": lat, "lng": lng} for label, lat, lng in REFERENCE_POINTS
        ]

        built = build_lot_geometry(bornes_input, distance_checks_input, reference_points_input)

        with transaction.atomic():
            lot = Lot.objects.create(
                titre_foncier=TITRE_FONCIER,
                propriete_dite="SAPINO 533",
                lot_number="533",
                surface_document_m2=10506,
                surface_calculee_m2=built.surface_calculee_m2,
                correction_lambert_m2=7.75,
            )
            Borne.objects.bulk_create(
                [
                    Borne(
                        lot=lot,
                        name=b.name,
                        sequence=b.sequence,
                        x_lambert=b.x_lambert,
                        y_lambert=b.y_lambert,
                        lat=b.lat,
                        lng=b.lng,
                    )
                    for b in built.bornes
                ]
            )
            DistanceCheck.objects.bulk_create(
                [
                    DistanceCheck(
                        lot=lot,
                        segment_label=dc.segment_label,
                        croquis_m=dc.croquis_m,
                        calcule_m=dc.calcule_m,
                        ecart_m=dc.ecart_m,
                    )
                    for dc in built.distance_checks
                ]
            )
            ReferencePoint.objects.bulk_create(
                [
                    ReferencePoint(
                        lot=lot,
                        label=rp.label,
                        lat=rp.lat,
                        lng=rp.lng,
                        distance_m=rp.distance_m,
                        bearing_deg=rp.bearing_deg,
                    )
                    for rp in built.reference_points
                ]
            )
            set_lot_geometry(lot.id, built.polygon_ring_lat_lng, built.centroid)

        self.stdout.write(
            self.style.SUCCESS(
                f"Lot 533 (Titre {TITRE_FONCIER}) créé — "
                f"surface calculée {built.surface_calculee_m2:.2f} m², id {lot.id}"
            )
        )
