from django.contrib import admin

from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ["id", "nom", "contact", "secteur"]
    search_fields = ["id", "nom", "contact", "email"]
