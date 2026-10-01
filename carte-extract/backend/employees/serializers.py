from rest_framework import serializers

from .models import Conge, Employee


class CongeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conge
        fields = ["id", "employee", "type", "date_debut", "date_fin", "statut", "motif"]


class EmployeeSerializer(serializers.ModelSerializer):
    conges = CongeSerializer(many=True, read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id", "user", "nom", "role", "poste", "telephone", "email",
            "date_embauche", "status", "notes", "conges",
        ]
