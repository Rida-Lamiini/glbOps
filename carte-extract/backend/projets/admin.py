from django.contrib import admin

from .models import HistoryEntry, Prestation, Projet, Tache


class TacheInline(admin.TabularInline):
    model = Tache
    extra = 0


class HistoryEntryInline(admin.TabularInline):
    model = HistoryEntry
    extra = 0


class PrestationInline(admin.StackedInline):
    model = Prestation
    extra = 0
    show_change_link = True


@admin.register(Projet)
class ProjetAdmin(admin.ModelAdmin):
    list_display = ["id", "client", "nature_prestation_projet", "date_debut"]
    list_filter = ["nature_prestation_projet"]
    search_fields = ["id", "reference_fonciere", "situation"]
    inlines = [PrestationInline]


@admin.register(Prestation)
class PrestationAdmin(admin.ModelAdmin):
    list_display = ["id", "projet", "stage", "nature_demandee"]
    list_filter = ["stage"]
    search_fields = ["id", "nature_demandee", "ref"]
    inlines = [TacheInline, HistoryEntryInline]
