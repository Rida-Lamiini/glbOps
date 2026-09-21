from rest_framework import serializers

from .models import MaintenanceLogEntry, Resource, ResourceMovement


class MaintenanceLogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceLogEntry
        fields = ["id", "resource", "date", "label"]


class ResourceMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceMovement
        fields = ["id", "resource", "kind", "at", "par_nom", "note", "kilometrage"]
        read_only_fields = ["id", "resource", "at", "par_nom"]


def current_checkout(resource):
    """Who has the resource right now: the latest movement if it is a check-out, else None."""
    latest = next(iter(resource.mouvements.all()), None)  # prefetched, newest first
    if latest is None or latest.kind != "sortie":
        return None
    return {"par_nom": latest.par_nom, "at": latest.at, "note": latest.note, "kilometrage": latest.kilometrage}


class ResourceSerializer(serializers.ModelSerializer):
    maintenance_log = MaintenanceLogEntrySerializer(many=True, read_only=True)
    sortie_courante = serializers.SerializerMethodField()

    def get_sortie_courante(self, resource):
        return current_checkout(resource)

    class Meta:
        model = Resource
        fields = [
            "id", "nom", "type", "marque", "modele", "numero_serie", "status",
            "derniere_calibration", "prochaine_calibration", "emplacement",
            "date_achat", "valeur", "fournisseur", "maintenance_log",
            "assurance_compagnie", "assurance_police", "assurance_debut", "assurance_echeance", "assurance_prime",
            "visite_technique_derniere", "visite_technique_prochaine", "vignette_paiement", "vignette_echeance",
            "kilometrage", "kilometrage_date", "entretien_prochain_date", "entretien_prochain_km",
            "carburant", "carte_carburant", "conducteur", "sortie_courante",
        ]
