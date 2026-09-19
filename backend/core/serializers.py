from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers

from .models import Attachment

ATTACHABLE_MODELS = {
    "projet": ("projets", "projet"),
    "prestation": ("projets", "prestation"),
    "resource": ("resources", "resource"),
}


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "is_staff"]


class AttachmentSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    size = serializers.SerializerMethodField()
    author = serializers.SerializerMethodField()
    content_type_model = serializers.SerializerMethodField()
    content_type_model_input = serializers.ChoiceField(
        choices=list(ATTACHABLE_MODELS), write_only=True,
    )

    class Meta:
        model = Attachment
        fields = [
            "id", "type", "label", "file", "chemin", "name", "size", "author",
            "ocr_text", "uploaded_at", "uploaded_by",
            "content_type_model", "content_type_model_input", "object_id",
        ]
        read_only_fields = ["ocr_text", "uploaded_at", "uploaded_by"]
        extra_kwargs = {"file": {"required": False}}

    def get_name(self, instance):
        return instance.file.name.rsplit("/", 1)[-1] if instance.file else ""

    def get_size(self, instance):
        try:
            return instance.file.size if instance.file else 0
        except OSError:
            return 0

    def get_author(self, instance):
        user = instance.uploaded_by
        if user is None:
            return ""
        employee = getattr(user, "employee", None)
        return employee.nom if employee else (user.first_name or user.username)

    def validate(self, attrs):
        if self.instance is None and not attrs.get("file") and not attrs.get("chemin"):
            raise serializers.ValidationError("Un fichier ou un chemin réseau est requis.")
        return attrs

    def get_content_type_model(self, instance):
        return instance.content_type.model

    def create(self, validated_data):
        model_key = validated_data.pop("content_type_model_input")
        app_label, model = ATTACHABLE_MODELS[model_key]
        validated_data["content_type"] = ContentType.objects.get_by_natural_key(app_label, model)
        return super().create(validated_data)
