from django.db import models


class Client(models.Model):
    id = models.CharField(max_length=20, primary_key=True)
    nom = models.CharField(max_length=200)
    contact = models.CharField(max_length=200, blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    adresse = models.CharField(max_length=300, blank=True)
    secteur = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom
