from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import HistoryEntryViewSet, PrestationViewSet, ProjetViewSet, TacheViewSet, monthly_report

router = DefaultRouter()
router.register("projets", ProjetViewSet)
router.register("prestations", PrestationViewSet)
router.register("taches", TacheViewSet)
router.register("history", HistoryEntryViewSet)

urlpatterns = [
    path("reports/monthly/", monthly_report, name="monthly-report"),
    *router.urls,
]
