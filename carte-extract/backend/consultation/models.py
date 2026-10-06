from django.conf import settings
from django.db import models


class Consultation(models.Model):
    """One position/parcel/file that somebody looked up — the audit trail of who searched what, when."""

    KIND_CHOICES = [("position", "Position"), ("parcelle", "Parcelle / fichier"), ("titre", "Titre foncier"),
                    ("lot", "Lot par lot"), ("pres", "Près de moi"), ("batch", "Traitement par lot")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    username = models.CharField(max_length=150, blank=True)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="position")
    label = models.CharField(max_length=300, blank=True)
    titre = models.CharField(max_length=100, blank=True)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    radius_m = models.PositiveIntegerField(default=0)
    n_found = models.PositiveIntegerField(default=0)
    n_alerts = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, default="ok")  # ok | warning | danger
    source_file = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class SeenProjet(models.Model):
    """Projets already evaluated for proximity: a notification is raised once, when a projet is first located."""

    projet_id = models.CharField(max_length=30, unique=True)
    geom_kind = models.CharField(max_length=10, blank=True)


class ProximityNotification(models.Model):
    projet_id = models.CharField(max_length=30, db_index=True)
    other_projet_id = models.CharField(max_length=30, blank=True)
    severity = models.CharField(max_length=10, default="info")  # info | warning | danger
    title = models.CharField(max_length=200)
    message = models.TextField()
    distance_m = models.FloatField(null=True, blank=True)
    read_by = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class ReferenceLayer(models.Model):
    """A set of neighbouring parcels imported from cadastre extracts, shown on the map as context."""

    name = models.CharField(max_length=200)
    note = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class ReferenceParcel(models.Model):
    layer = models.ForeignKey(ReferenceLayer, related_name="parcels", on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    titre = models.CharField(max_length=100, blank=True)
    geometry = models.JSONField()  # GeoJSON Polygon / LineString / Point
    declared_surface_m2 = models.FloatField(null=True, blank=True)
