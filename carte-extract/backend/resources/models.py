from django.conf import settings
from django.db import models

TYPE_CHOICES = [
    ("station_totale", "Station totale"),
    ("gps", "GPS / GNSS"),
    ("drone", "Drone"),
    ("scanner", "Scanner 3D / LiDAR"),
    ("niveau", "Niveau optique"),
    ("vehicule", "Véhicule"),
    ("autre", "Autre"),
]

STATUS_CHOICES = [
    ("operationnel", "Opérationnel"),
    ("maintenance", "En maintenance"),
    ("hors_service", "Hors service"),
]


CARBURANT_CHOICES = [
    ("diesel", "Diesel"),
    ("essence", "Essence"),
    ("hybride", "Hybride"),
    ("electrique", "Électrique"),
]


class Resource(models.Model):
    id = models.CharField(max_length=20, primary_key=True)
    nom = models.CharField(max_length=200)
    type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    marque = models.CharField(max_length=100, blank=True)
    modele = models.CharField(max_length=100, blank=True)
    numero_serie = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="operationnel")
    derniere_calibration = models.DateField(null=True, blank=True)
    prochaine_calibration = models.DateField(null=True, blank=True)
    emplacement = models.CharField(max_length=200, blank=True)
    date_achat = models.DateField(null=True, blank=True)
    valeur = models.CharField(max_length=50, blank=True)
    fournisseur = models.CharField(max_length=200, blank=True)

    # Administrative papers and upkeep — only meaningful for vehicles, left empty for equipment.
    assurance_compagnie = models.CharField(max_length=150, blank=True)
    assurance_police = models.CharField(max_length=100, blank=True)
    assurance_debut = models.DateField(null=True, blank=True)
    assurance_echeance = models.DateField(null=True, blank=True)
    assurance_prime = models.CharField(max_length=50, blank=True)
    visite_technique_derniere = models.DateField(null=True, blank=True)
    visite_technique_prochaine = models.DateField(null=True, blank=True)
    vignette_paiement = models.DateField(null=True, blank=True)
    vignette_echeance = models.DateField(null=True, blank=True)
    kilometrage = models.PositiveIntegerField(null=True, blank=True)
    kilometrage_date = models.DateField(null=True, blank=True)
    entretien_prochain_date = models.DateField(null=True, blank=True)
    entretien_prochain_km = models.PositiveIntegerField(null=True, blank=True)
    carburant = models.CharField(max_length=20, choices=CARBURANT_CHOICES, blank=True)
    carte_carburant = models.CharField(max_length=60, blank=True)
    conducteur = models.ForeignKey(
        "employees.Employee", related_name="vehicules_habituels", null=True, blank=True, on_delete=models.SET_NULL,
    )

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class MaintenanceLogEntry(models.Model):
    resource = models.ForeignKey(Resource, related_name="maintenance_log", on_delete=models.CASCADE)
    date = models.DateField()
    label = models.CharField(max_length=300)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.resource} — {self.label}"


MOVEMENT_KIND_CHOICES = [
    ("sortie", "Sortie"),
    ("retour", "Retour"),
]


class ResourceMovement(models.Model):
    """A check-out ("sortie") or check-in ("retour") of a piece of equipment or a vehicle, usually
    recorded by scanning the QR label stuck on it. The latest movement tells who has it now."""

    resource = models.ForeignKey(Resource, related_name="mouvements", on_delete=models.CASCADE)
    kind = models.CharField(max_length=10, choices=MOVEMENT_KIND_CHOICES)
    at = models.DateTimeField(auto_now_add=True)
    par = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="+", null=True, blank=True, on_delete=models.SET_NULL)
    par_nom = models.CharField(max_length=200, blank=True)
    note = models.CharField(max_length=300, blank=True)
    kilometrage = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-at", "-id"]

    def __str__(self):
        return f"{self.resource} — {self.kind} — {self.par_nom}"
