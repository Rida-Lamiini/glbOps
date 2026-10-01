from django.conf import settings
from django.db import models

ROLE_CHOICES = [(v, v) for v in [
    "Dispatcher",
    "Directrice",
    "Agent Chantier",
    "Agent Bureau",
    "Agent Contrôle",
]]

STATUS_CHOICES = [
    ("actif", "Actif"),
    ("inactif", "Inactif"),
]

CONGE_TYPE_CHOICES = [(v, v) for v in [
    "Congé payé",
    "Congé maladie",
    "Congé sans solde",
    "Autre",
]]

CONGE_STATUT_CHOICES = [
    ("en_attente", "En attente"),
    ("approuve", "Approuvé"),
    ("refuse", "Refusé"),
]


class Employee(models.Model):
    id = models.CharField(max_length=20, primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="employee",
    )
    nom = models.CharField(max_length=200)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    poste = models.CharField(max_length=200, blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    date_embauche = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="actif")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Conge(models.Model):
    id = models.CharField(max_length=20, primary_key=True)
    employee = models.ForeignKey(Employee, related_name="conges", on_delete=models.CASCADE)
    type = models.CharField(max_length=30, choices=CONGE_TYPE_CHOICES)
    date_debut = models.DateField()
    date_fin = models.DateField()
    statut = models.CharField(max_length=20, choices=CONGE_STATUT_CHOICES, default="en_attente")
    motif = models.TextField(blank=True)

    class Meta:
        ordering = ["-date_debut"]

    def __str__(self):
        return f"{self.employee} — {self.type}"
