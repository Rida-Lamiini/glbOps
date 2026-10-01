from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers

from employees.models import Employee

from .mentions import find_mentioned
from .models import Attachment, Comment

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


class CommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    readers = serializers.SerializerMethodField()
    mentions = serializers.SerializerMethodField()
    content_type_model_input = serializers.ChoiceField(
        choices=list(ATTACHABLE_MODELS), write_only=True,
    )

    class Meta:
        model = Comment
        fields = ["id", "text", "author", "created_at", "is_read", "readers", "mentions", "content_type_model_input", "object_id"]
        read_only_fields = ["created_at"]

    def _display_name(self, user):
        employee = getattr(user, "employee", None)
        return employee.nom if employee else (user.first_name or user.username)

    def get_author(self, instance):
        return self._display_name(instance.created_by) if instance.created_by else ""

    def get_is_read(self, instance):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return False
        # Prefetched (list/detail reads) or not (right after creation) — works either way.
        return any(u.pk == user.pk for u in instance.read_by.all())

    def get_readers(self, instance):
        # Who has seen this comment — so the person who wrote it can tell whether it landed,
        # not just that it was posted.
        return [self._display_name(u) for u in instance.read_by.all()]

    def get_mentions(self, instance):
        # Current names, not the text as typed — a renamed employee is still found by the bell.
        return [{"id": e.id, "nom": e.nom} for e in instance.mentions.all()]

    def _resolve_mentions(self, comment):
        comment.mentions.set(find_mentioned(comment.text, Employee.objects.all()))

    def create(self, validated_data):
        model_key = validated_data.pop("content_type_model_input")
        app_label, model = ATTACHABLE_MODELS[model_key]
        validated_data["content_type"] = ContentType.objects.get_by_natural_key(app_label, model)
        comment = super().create(validated_data)
        self._resolve_mentions(comment)
        return comment

    def update(self, instance, validated_data):
        validated_data.pop("content_type_model_input", None)
        comment = super().update(instance, validated_data)
        if "text" in validated_data:
            self._resolve_mentions(comment)
        return comment
