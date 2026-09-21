from rest_framework import serializers

from .models import MaintenanceLogEntry, Resource


class MaintenanceLogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceLogEntry
        fields = ["id", "resource", "date", "label"]


class ResourceSerializer(serializers.ModelSerializer):
    maintenance_log = MaintenanceLogEntrySerializer(many=True, read_only=True)

    class Meta:
        model = Resource
        fields = [
            "id", "nom", "type", "marque", "modele", "numero_serie", "status",
            "derniere_calibration", "prochaine_calibration", "emplacement",
            "date_achat", "valeur", "fournisseur", "maintenance_log",
            "assurance_compagnie", "assurance_police", "assurance_debut", "assurance_echeance", "assurance_prime",
            "visite_technique_derniere", "visite_technique_prochaine", "vignette_paiement", "vignette_echeance",
            "kilometrage", "kilometrage_date", "entretien_prochain_date", "entretien_prochain_km",
            "carburant", "carte_carburant", "conducteur",
        ]
