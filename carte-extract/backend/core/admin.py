from django.contrib import admin

from .models import Attachment


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ["id", "type", "label", "content_type", "object_id", "uploaded_at"]
    list_filter = ["type", "content_type"]
