from rest_framework import serializers

from core.serializers import AttachmentSerializer, CommentSerializer

from .models import HistoryEntry, Prestation, Projet, Tache
from .stages import sla_info


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
    # Time spent in the current stage against its allowance; computed, never written.
    stage_age_days = serializers.SerializerMethodField()
    sla_days = serializers.SerializerMethodField()
    sla_status = serializers.SerializerMethodField()

    def get_stage_age_days(self, obj):
        return sla_info(obj.stage, obj.stage_since)[0]

    def get_sla_days(self, obj):
        return sla_info(obj.stage, obj.stage_since)[1]

    def get_sla_status(self, obj):
        return sla_info(obj.stage, obj.stage_since)[2]

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
            "stage", "stage_since", "stage_age_days", "sla_days", "sla_status", "cycles", "reprogramme", "reprog_en_attente", "reprog_date", "reprog_motif", "non_conformite_source",
            "taches", "history", "attachments", "comments",
        ]
        read_only_fields = ["stage_since"]


class ProjetSerializer(serializers.ModelSerializer):
    prestations = PrestationSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Projet
        fields = [
            "id", "client", "reference_fonciere", "situation", "lat", "lng",
            "nature_prestation_projet", "date_debut", "notes", "boundary",
            "prestations", "attachments", "version",
        ]
        read_only_fields = ["version"]
