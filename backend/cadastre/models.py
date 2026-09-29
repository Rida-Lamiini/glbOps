import uuid

from django.conf import settings
from django.db import models

from projets.models import Prestation, Projet

STATUT_CHOICES = [
    ("brouillon", "Brouillon"),
    ("verifie", "Vérifié"),
    ("valide", "Validé"),
]


class Lot(models.Model):
    """A cadastral lot read off an ANCFCC "Calcul de Contenances" document.

    The PostGIS ``polygon``/``centroid`` columns are not declared here: they
    are added by migration 0002 and read/written through raw SQL in
    ``cadastre/db/geometry.py``, so the project does not need GeoDjango (and
    its GDAL/GEOS system libraries) installed just to store and serve them.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # A lot's titre_foncier is the same document reference a Projet already
    # tracks as reference_fonciere — linking here is what turns a parsed PDF
    # into "the cadastral survey backing this projet" rather than a record
    # floating on its own. Optional: a lot can be reviewed/saved before a
    # matching projet exists yet, or never get one at all.
    projet = models.ForeignKey(
        Projet, related_name="lots_cadastraux", null=True, blank=True, on_delete=models.SET_NULL,
    )

    # The prestation this survey was calculated for, who entered it, and where it
    # stands in review: brouillon -> verifie (bureau) -> valide (controle).
    prestation = models.ForeignKey(
        Prestation, related_name="lots_cadastraux", null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", null=True, blank=True, on_delete=models.SET_NULL,
    )
    statut = models.CharField(max_length=12, choices=STATUT_CHOICES, default="brouillon")
    statut_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", null=True, blank=True, on_delete=models.SET_NULL,
    )
    statut_at = models.DateTimeField(null=True, blank=True)

    # A lot the team already surveyed can be reused on a later projet for the
    # same titre foncier: the copy keeps a pointer to where it came from, so
    # titre_foncier is unique per projet rather than globally.
    derive_de = models.ForeignKey(
        "self", related_name="copies", null=True, blank=True, on_delete=models.SET_NULL,
    )

    titre_foncier = models.CharField(max_length=100, db_index=True)
    propriete_dite = models.CharField(max_length=300)
    lot_number = models.CharField(max_length=50, blank=True)
    affaire_ref = models.CharField(max_length=300, blank=True)
    geometre = models.CharField(max_length=200, blank=True)
    date_leve = models.DateField(null=True, blank=True)
    service_cadastre = models.CharField(max_length=200, blank=True)
    # Lambert zone of the bornes' X/Y: Nord (EPSG:26191) or Sud (EPSG:26192).
    zone = models.CharField(max_length=4, choices=[("nord", "Nord"), ("sud", "Sud")], default="nord")

    # surface_document_m2 is the "contenance adoptée" printed on the document;
    # surface_calculee_m2 is always recomputed from the bornes on save, never
    # taken from the request, so it can be trusted as a cross-check.
    surface_document_m2 = models.DecimalField(max_digits=12, decimal_places=2)
    surface_calculee_m2 = models.DecimalField(max_digits=12, decimal_places=2)
    correction_lambert_m2 = models.DecimalField(max_digits=12, decimal_places=2)
    # Sum of the lot's signed Ajustement rows (appoints add or remove, déductions remove),
    # kept here so every conformity check reads one number.
    ajustements_m2 = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    # Shift (metres, Lambert) applied only when placing the lot on the map. Some old plans carry local
    # or truncated coordinates that land far from the real parcel; the office then drops the lot at its
    # true place on the map and this offset records that move. The bornes keep the document's X/Y.
    # Marks drawn on the plan in the review workspace (pen strokes, boxes, notes, pins) — a JSON list
    # in the plan image's own pixel space, so they stay put at any zoom.
    annotations = models.JSONField(default=list, blank=True)
    decalage_x = models.FloatField(default=0)
    decalage_y = models.FloatField(default=0)
    # ...and the turn (degrees, counter-clockwise) about a fixed document point, for a lot that has to be oriented
    # to match the ground.
    rotation_deg = models.FloatField(default=0)
    pivot_x = models.FloatField(default=0)
    pivot_y = models.FloatField(default=0)

    @property
    def surface_verifiable(self):
        """False when the document gives no surface to compare with (a sheet without its totals page)."""
        return float(self.surface_document_m2 or 0) > 0

    @property
    def position_approximative(self):
        return bool(self.decalage_x or self.decalage_y or self.rotation_deg)

    @property
    def placement(self):
        """Keyword arguments for build_lot_geometry / placement.place."""
        return {"offset": (self.decalage_x, self.decalage_y), "rotation_deg": self.rotation_deg, "pivot": (self.pivot_x, self.pivot_y)}

    source_pdf_url = models.CharField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cadastre_lots"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["titre_foncier", "projet"],
                condition=models.Q(projet__isnull=False),
                name="unique_titre_per_projet",
            )
        ]

    def __str__(self):
        return f"{self.titre_foncier} — {self.propriete_dite}"


class Borne(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot = models.ForeignKey(Lot, related_name="bornes", on_delete=models.CASCADE)

    name = models.CharField(max_length=50)
    sequence = models.IntegerField()

    x_lambert = models.DecimalField(max_digits=12, decimal_places=3)
    y_lambert = models.DecimalField(max_digits=12, decimal_places=3)
    lat = models.DecimalField(max_digits=10, decimal_places=7)
    lng = models.DecimalField(max_digits=10, decimal_places=7)

    class Meta:
        db_table = "cadastre_bornes"
        ordering = ["sequence"]
        constraints = [
            models.UniqueConstraint(fields=["lot", "sequence"], name="unique_borne_sequence_per_lot")
        ]
        indexes = [models.Index(fields=["lot"])]

    def __str__(self):
        return self.name


class Ajustement(models.Model):
    """A surface adjustment printed on the document between S and the adopted contenance
    (appoint graphique, cimetière, parcelle détachée...). ``m2`` is signed: a déduction
    is negative, an appoint can be either."""

    TYPE_CHOICES = [("appoint", "Appoint"), ("deduction", "Déduction")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot = models.ForeignKey(Lot, related_name="ajustements", on_delete=models.CASCADE)
    libelle = models.CharField(max_length=200)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="deduction")
    m2 = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        db_table = "cadastre_ajustements"
        ordering = ["id"]

    def __str__(self):
        return f"{self.libelle} ({self.m2} m²)"


class DistanceCheck(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot = models.ForeignKey(Lot, related_name="distance_checks", on_delete=models.CASCADE)

    segment_label = models.CharField(max_length=100)
    croquis_m = models.DecimalField(max_digits=10, decimal_places=3)
    calcule_m = models.DecimalField(max_digits=10, decimal_places=3)
    ecart_m = models.DecimalField(max_digits=10, decimal_places=3)

    class Meta:
        db_table = "cadastre_distance_checks"
        indexes = [models.Index(fields=["lot"])]

    def __str__(self):
        return self.segment_label


class ReferencePoint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lot = models.ForeignKey(Lot, related_name="reference_points", on_delete=models.CASCADE)

    label = models.CharField(max_length=200)
    lat = models.DecimalField(max_digits=10, decimal_places=7)
    lng = models.DecimalField(max_digits=10, decimal_places=7)
    distance_m = models.DecimalField(max_digits=10, decimal_places=3)
    bearing_deg = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        db_table = "cadastre_reference_points"
        indexes = [models.Index(fields=["lot"])]

    def __str__(self):
        return self.label
