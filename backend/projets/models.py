from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from core.models import Attachment

from clients.models import Client
from employees.models import Employee
from resources.models import Resource

STAGE_CHOICES = [
    ("demande", "Demande"),
    ("prestation", "Prestation demandée"),
    ("affectation", "Affectation terrain"),
    ("execution", "Exécution"),
    ("bureau", "Traitement bureau"),
    ("controle", "Contrôle"),
    ("livraison", "Livraison"),
]

NON_CONFORMITY_SOURCE_CHOICES = [
    ("chantier", "Agent Chantier (exécution terrain)"),
    ("bureau", "Agent Bureau (traitement)"),
]


class Projet(models.Model):
    id = models.CharField(max_length=30, primary_key=True)
    client = models.ForeignKey(Client, related_name="projets", on_delete=models.PROTECT)
    reference_fonciere = models.CharField(max_length=100, blank=True)
    situation = models.CharField(max_length=300, blank=True)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    nature_prestation_projet = models.CharField(max_length=200, blank=True)
    date_debut = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    # GeoJSON Polygon drawn by the team; empty until a real boundary is known.
    boundary = models.JSONField(null=True, blank=True)
    attachments = GenericRelation(Attachment)

    class Meta:
        ordering = ["-date_debut"]

    def __str__(self):
        return self.id


class Prestation(models.Model):
    id = models.CharField(max_length=30, primary_key=True)
    attachments = GenericRelation(Attachment)
    projet = models.ForeignKey(Projet, related_name="prestations", on_delete=models.CASCADE)

    nature_demandee = models.CharField(max_length=300, blank=True)
    nature_executee = models.CharField(max_length=300, blank=True)
    date_debut_demande = models.DateField(null=True, blank=True)
    date_fin_demande = models.DateField(null=True, blank=True)

    agent_chantier = models.ManyToManyField(Employee, related_name="prestations_chantier", blank=True)
    materiels = models.ManyToManyField(Resource, related_name="prestations", blank=True)
    vehicule = models.ForeignKey(
        Resource, related_name="prestations_vehicule", null=True, blank=True, on_delete=models.SET_NULL,
    )
    # Field entries sometimes carry a trailing time (e.g. "18/08/2026 16:30" in the frontend
    # seed data), so these stay as free-form strings rather than DateField.
    date_debut_exec = models.CharField(max_length=30, blank=True)
    date_fin_exec = models.CharField(max_length=30, blank=True)

    agent_bureau = models.ForeignKey(
        Employee, related_name="prestations_bureau", null=True, blank=True, on_delete=models.SET_NULL,
    )
    chemin_bureau = models.CharField(max_length=500, blank=True)
    date_debut_bureau = models.DateField(null=True, blank=True)
    date_fin_bureau = models.DateField(null=True, blank=True)

    agent_controle = models.ForeignKey(
        Employee, related_name="prestations_controle", null=True, blank=True, on_delete=models.SET_NULL,
    )
    date_debut_controle = models.DateField(null=True, blank=True)
    date_fin_controle = models.DateField(null=True, blank=True)

    date_livraison = models.DateField(null=True, blank=True)
    ref = models.CharField(max_length=50, blank=True)
    chemin = models.CharField(max_length=500, blank=True)
    cd_n = models.CharField(max_length=50, blank=True)
    disque_n = models.CharField(max_length=50, blank=True)

    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default="demande")
    cycles = models.PositiveIntegerField(default=0)
    reprogramme = models.BooleanField(default=False)
    non_conformite_source = models.CharField(max_length=20, choices=NON_CONFORMITY_SOURCE_CHOICES, blank=True)

    class Meta:
        ordering = ["-date_debut_demande"]

    def __str__(self):
        return self.id


class Tache(models.Model):
    prestation = models.ForeignKey(Prestation, related_name="taches", on_delete=models.CASCADE)
    label = models.CharField(max_length=200)
    done = models.BooleanField(default=False)
    agents = models.ManyToManyField(Employee, related_name="taches", blank=True)

    def __str__(self):
        return self.label


class HistoryEntry(models.Model):
    prestation = models.ForeignKey(Prestation, related_name="history", on_delete=models.CASCADE)
    date = models.CharField(max_length=30)
    label = models.CharField(max_length=500)
    author = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.label
