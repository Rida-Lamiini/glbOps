from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from .models import HistoryEntry, Prestation, Projet, Tache
from .pv import build_pv
from .serializers import HistoryEntrySerializer, PrestationSerializer, ProjetSerializer, TacheSerializer


class ProjetViewSet(viewsets.ModelViewSet):
    queryset = Projet.objects.select_related("client").prefetch_related("prestations").all()
    serializer_class = ProjetSerializer


class PrestationViewSet(viewsets.ModelViewSet):
    queryset = Prestation.objects.select_related("projet", "agent_bureau", "agent_controle", "vehicule").prefetch_related(
        "agent_chantier", "materiels", "taches", "history",
    ).all()
    serializer_class = PrestationSerializer

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated])
    def pv(self, request, pk=None):
        """The prestation's procès-verbal as a PDF download."""
        prestation = self.get_object()
        response = HttpResponse(build_pv(prestation), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="PV-{prestation.id}.pdf"'
        return response


class TacheViewSet(viewsets.ModelViewSet):
    queryset = Tache.objects.select_related("prestation").all()
    serializer_class = TacheSerializer


class HistoryEntryViewSet(viewsets.ModelViewSet):
    queryset = HistoryEntry.objects.select_related("prestation").all()
    serializer_class = HistoryEntrySerializer
