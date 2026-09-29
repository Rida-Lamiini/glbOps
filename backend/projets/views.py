from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import OFFICE_ROLES, OfficeCreateDelete

from .models import HistoryEntry, Prestation, Projet, Tache
from .pv import build_pv
from .report_monthly import build_monthly_report, parse_month
from .serializers import HistoryEntrySerializer, PrestationSerializer, ProjetSerializer, TacheSerializer
from .stages import check_transition


class ProjetViewSet(viewsets.ModelViewSet):
    queryset = Projet.objects.select_related("client").prefetch_related("prestations").all()
    serializer_class = ProjetSerializer
    permission_classes = [OfficeCreateDelete]


class PrestationViewSet(viewsets.ModelViewSet):
    queryset = Prestation.objects.select_related("projet", "agent_bureau", "agent_controle", "vehicule").prefetch_related(
        "agent_chantier", "materiels", "taches", "history",
    ).all()
    serializer_class = PrestationSerializer
    permission_classes = [OfficeCreateDelete]

    def perform_create(self, serializer):
        serializer.save(stage_since=timezone.now())

    def perform_update(self, serializer):
        new_stage = serializer.validated_data.get("stage")
        if new_stage is not None and new_stage != serializer.instance.stage:
            check_transition(self.request.user, serializer.instance.stage, new_stage)
            serializer.save(stage_since=timezone.now())
        else:
            serializer.save()

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

    def perform_create(self, serializer):
        # The trail says who did it, so the author comes from the session, not from the client.
        user = self.request.user
        employee = getattr(user, "employee", None)
        serializer.save(author=employee.nom if employee else (user.get_full_name() or user.username))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def monthly_report(request):
    """The management report for ``?month=YYYY-MM`` (default: this month) as a PDF. Office only:
    it covers every projet, agent and resource."""
    employee = getattr(request.user, "employee", None)
    if employee is not None and employee.role not in OFFICE_ROLES:
        return Response({"detail": "Réservé à la direction."}, status=status.HTTP_403_FORBIDDEN)
    key = request.query_params.get("month") or timezone.localdate().strftime("%Y-%m")
    try:
        year, month = parse_month(key)
    except ValueError:
        return Response({"month": "Format attendu : AAAA-MM."}, status=status.HTTP_400_BAD_REQUEST)
    author = employee.nom if employee else (request.user.first_name or request.user.username)
    response = HttpResponse(build_monthly_report(year, month, author), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="Rapport-direction-{year}-{month:02d}.pdf"'
    return response
