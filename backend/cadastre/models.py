import uuid

from django.db import models


class Lot(models.Model):
    """A cadastral lot read off an ANCFCC "Calcul de Contenances" document.

    The PostGIS ``polygon``/``centroid`` columns are not declared here: they
    are added by migration 0002 and read/written through raw SQL in
    ``cadastre/db/geometry.py``, so the project does not need GeoDjango (and
    its GDAL/GEOS system libraries) installed just to store and serve them.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    titre_foncier = models.CharField(max_length=100, unique=True)
    propriete_dite = models.CharField(max_length=300)
    lot_number = models.CharField(max_length=50, blank=True)
    affaire_ref = models.CharField(max_length=300, blank=True)
    geometre = models.CharField(max_length=200, blank=True)
    date_leve = models.DateField(null=True, blank=True)
    service_cadastre = models.CharField(max_length=200, blank=True)

    # surface_document_m2 is the "contenance adoptée" printed on the document;
    # surface_calculee_m2 is always recomputed from the bornes on save, never
    # taken from the request, so it can be trusted as a cross-check.
    surface_document_m2 = models.DecimalField(max_digits=12, decimal_places=2)
    surface_calculee_m2 = models.DecimalField(max_digits=12, decimal_places=2)
    correction_lambert_m2 = models.DecimalField(max_digits=12, decimal_places=2)

    source_pdf_url = models.CharField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cadastre_lots"
        ordering = ["-updated_at"]

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
