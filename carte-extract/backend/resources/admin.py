from django.contrib import admin

from .models import MaintenanceLogEntry, Resource


class MaintenanceLogEntryInline(admin.TabularInline):
    model = MaintenanceLogEntry
    extra = 0


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ["id", "nom", "type", "status"]
    list_filter = ["type", "status"]
    search_fields = ["id", "nom", "numero_serie"]
    inlines = [MaintenanceLogEntryInline]
