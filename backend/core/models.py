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
    # Either an uploaded file or a network path (chemin) the team keeps on their server.
    file = models.FileField(upload_to="attachments/%Y/%m/", blank=True)
    chemin = models.CharField(max_length=500, blank=True)
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


class Comment(models.Model):
    """A free-form note between people working a prestation — separate from HistoryEntry,
    which only ever logs automated pipeline events (stage changes, task completions)."""

    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        "auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="comments",
    )

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=30)
    content_object = GenericForeignKey("content_type", "object_id")

    # Who has acknowledged this comment — lets everyone see, at a glance, which notes still
    # need attention versus which have already been seen by the team.
    read_by = models.ManyToManyField("auth.User", related_name="comments_read", blank=True)

    # Resolved from "@Full Name" in the text when the comment is saved (core.mentions), so a
    # mention survives the employee being renamed later.
    mentions = models.ManyToManyField("employees.Employee", related_name="mentioned_in", blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return self.text[:50]
