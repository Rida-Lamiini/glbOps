from django.contrib import admin

from .models import Borne, DistanceCheck, Lot, ReferencePoint


class BorneInline(admin.TabularInline):
    model = Borne
    extra = 0


class DistanceCheckInline(admin.TabularInline):
    model = DistanceCheck
    extra = 0


class ReferencePointInline(admin.TabularInline):
    model = ReferencePoint
    extra = 0


@admin.register(Lot)
class LotAdmin(admin.ModelAdmin):
    list_display = ("titre_foncier", "propriete_dite", "surface_document_m2", "updated_at")
    search_fields = ("titre_foncier", "propriete_dite")
    inlines = [BorneInline, DistanceCheckInline, ReferencePointInline]
