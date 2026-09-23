from rest_framework import serializers

from core.serializers import AttachmentSerializer, CommentSerializer

from .models import HistoryEntry, Prestation, Projet, Tache


class HistoryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = HistoryEntry
        fields = ["id", "prestation", "date", "label", "author"]


class TacheSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tache
        fields = ["id", "prestation", "label", "done", "agents"]


class PrestationSerializer(serializers.ModelSerializer):
    taches = TacheSerializer(many=True, read_only=True)
    history = HistoryEntrySerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)

    class Meta:
        model = Prestation
        fields = [
            "id", "projet",
            "nature_demandee", "nature_executee",
            "date_debut_demande", "date_fin_demande",
            "agent_chantier", "materiels", "vehicule",
            "date_debut_exec", "date_fin_exec",
            "agent_bureau", "chemin_bureau", "date_debut_bureau", "date_fin_bureau",
            "agent_controle", "date_debut_controle", "date_fin_controle",
            "date_livraison", "ref", "chemin", "cd_n", "disque_n",
            "stage", "cycles", "reprogramme", "non_conformite_source",
            "taches", "history", "attachments", "comments",
        ]


class ProjetSerializer(serializers.ModelSerializer):
    prestations = PrestationSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Projet
        fields = [
            "id", "client", "reference_fonciere", "situation", "lat", "lng",
            "nature_prestation_projet", "date_debut", "notes", "boundary",
            "prestations", "attachments",
        ]
