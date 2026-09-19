from rest_framework import serializers

from projets.models import Projet

from .geo.build_lot import is_surface_conforme
from .models import Borne, DistanceCheck, Lot, ReferencePoint


class BorneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Borne
        fields = ["id", "name", "sequence", "x_lambert", "y_lambert", "lat", "lng"]


class DistanceCheckSerializer(serializers.ModelSerializer):
    class Meta:
        model = DistanceCheck
        fields = ["id", "segment_label", "croquis_m", "calcule_m", "ecart_m"]


class ReferencePointSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReferencePoint
        fields = ["id", "label", "lat", "lng", "distance_m", "bearing_deg"]


class LotListSerializer(serializers.ModelSerializer):
    conforme = serializers.SerializerMethodField()

    class Meta:
        model = Lot
        fields = [
            "id",
            "projet",
            "derive_de",
            "titre_foncier",
            "propriete_dite",
            "surface_document_m2",
            "surface_calculee_m2",
            "correction_lambert_m2",
            "updated_at",
            "conforme",
        ]

    def get_conforme(self, lot: Lot) -> bool:
        return is_surface_conforme(
            float(lot.surface_calculee_m2),
            float(lot.correction_lambert_m2),
            float(lot.surface_document_m2),
        )


class LotDetailSerializer(LotListSerializer):
    bornes = BorneSerializer(many=True, read_only=True)
    distance_checks = DistanceCheckSerializer(many=True, read_only=True)
    reference_points = ReferencePointSerializer(many=True, read_only=True)

    class Meta(LotListSerializer.Meta):
        fields = LotListSerializer.Meta.fields + [
            "lot_number",
            "affaire_ref",
            "geometre",
            "date_leve",
            "service_cadastre",
            "source_pdf_url",
            "created_at",
            "bornes",
            "distance_checks",
            "reference_points",
        ]


# --- Write payloads -------------------------------------------------------


class BorneInputSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=1, max_length=50)
    sequence = serializers.IntegerField(min_value=0)
    x_lambert = serializers.FloatField()
    y_lambert = serializers.FloatField()


class DistanceCheckInputSerializer(serializers.Serializer):
    segment_label = serializers.CharField(min_length=1, max_length=100)
    croquis_m = serializers.FloatField(min_value=0)


class ReferencePointInputSerializer(serializers.Serializer):
    label = serializers.CharField(min_length=1, max_length=200)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)


class CreateLotSerializer(serializers.Serializer):
    projet = serializers.PrimaryKeyRelatedField(
        queryset=Projet.objects.all(), required=False, allow_null=True,
    )
    titre_foncier = serializers.CharField(min_length=1, max_length=100)
    propriete_dite = serializers.CharField(min_length=1, max_length=300)
    lot_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    affaire_ref = serializers.CharField(max_length=300, required=False, allow_blank=True)
    geometre = serializers.CharField(max_length=200, required=False, allow_blank=True)
    date_leve = serializers.DateField(required=False, allow_null=True)
    service_cadastre = serializers.CharField(max_length=200, required=False, allow_blank=True)
    surface_document_m2 = serializers.FloatField(min_value=0)
    correction_lambert_m2 = serializers.FloatField()
    source_pdf_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
    bornes = BorneInputSerializer(many=True)
    distance_checks = DistanceCheckInputSerializer(many=True, required=False, default=list)
    reference_points = ReferencePointInputSerializer(many=True, required=False, default=list)

    def _check_titre_unique_per_projet(self, attrs):
        # A titre foncier may appear on several projets (a reused survey), but
        # only once per projet.
        projet = attrs.get("projet")
        if projet is not None:
            queryset = Lot.objects.filter(titre_foncier=attrs["titre_foncier"], projet=projet)
            lot_id = self.context.get("lot_id")
            if lot_id is not None:
                queryset = queryset.exclude(pk=lot_id)
            if queryset.exists():
                raise serializers.ValidationError(
                    {"titre_foncier": "Ce projet a déjà un lot avec ce titre foncier."}
                )

    def validate_bornes(self, value):
        if len(value) < 3:
            raise serializers.ValidationError("Un polygone nécessite au moins 3 bornes.")
        sequences = [b["sequence"] for b in value]
        if len(set(sequences)) != len(sequences):
            raise serializers.ValidationError("Deux bornes ne peuvent pas avoir le même rang.")
        return value

    def validate(self, attrs):
        self._check_titre_unique_per_projet(attrs)
        # A distance check names its two endpoints by borne name. If either name
        # isn't in the submitted table the distance is unmeasurable, so reject it
        # here rather than storing an unusable row that would silently read as a
        # 0 m deviation.
        borne_names = {b["name"].strip().lower() for b in attrs["bornes"]}
        for dc in attrs.get("distance_checks") or []:
            parts = [p.strip() for p in dc["segment_label"].split("-")]
            unknown = [p for p in parts if p.lower() not in borne_names]
            if len(parts) != 2 or unknown:
                raise serializers.ValidationError(
                    {
                        "distance_checks": (
                            f"Le segment « {dc['segment_label']} » doit référencer deux bornes "
                            "du tableau, sous la forme « B3452-B3453 »."
                        )
                    }
                )
        return attrs
