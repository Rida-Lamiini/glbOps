from django.contrib import admin

from .models import Conge, Employee


class CongeInline(admin.TabularInline):
    model = Conge
    extra = 0


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ["id", "nom", "role", "status", "user"]
    list_filter = ["role", "status"]
    search_fields = ["id", "nom", "email"]
    inlines = [CongeInline]


@admin.register(Conge)
class CongeAdmin(admin.ModelAdmin):
    list_display = ["id", "employee", "type", "date_debut", "date_fin", "statut"]
    list_filter = ["type", "statut"]
