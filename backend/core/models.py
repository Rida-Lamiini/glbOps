from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models

TYPE_CHOICES = [
    ("photo", "Photo terrain"),
    ("livrable", "Livrable (PV/DWG)"),
    ("autre", "Autre document"),
]


class Attachment(models.Model):
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="autre")
    label = models.CharField(max_length=300, blank=True)
    file = models.FileField(upload_to="attachments/%Y/%m/")
    ocr_text = models.TextField(blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        "auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="attachments",
    )

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=30)
    content_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return self.label or self.file.name
