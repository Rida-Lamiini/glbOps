from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import MaintenanceLogEntry, Resource, ResourceMovement
from .serializers import (
    MaintenanceLogEntrySerializer,
    ResourceMovementSerializer,
    ResourceSerializer,
    current_checkout,
)


def _display_name(user):
    employee = getattr(user, "employee", None)
    if employee is not None:
        return employee.nom
    return user.get_full_name() or user.username


class ResourceViewSet(viewsets.ModelViewSet):
    queryset = Resource.objects.prefetch_related("maintenance_log", "mouvements").all()
    serializer_class = ResourceSerializer

    @action(detail=True, methods=["get", "post"], url_path="movements", permission_classes=[IsAuthenticated])
    def movements(self, request, pk=None):
        """GET: the latest movements. POST {kind: sortie|retour, note?, kilometrage?}: record one."""
        resource = self.get_object()
        if request.method == "GET":
            rows = resource.mouvements.all()[:30]
            return Response(ResourceMovementSerializer(rows, many=True).data)

        serializer = ResourceMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kind = serializer.validated_data["kind"]
        km = serializer.validated_data.get("kilometrage")

        with transaction.atomic():
            # Lock the row so two scans at the same moment cannot both check the item out.
            locked = Resource.objects.select_for_update().get(pk=resource.pk)
            latest = locked.mouvements.first()
            holder = latest if latest is not None and latest.kind == "sortie" else None
            if kind == "sortie":
                if holder is not None:
                    return Response(
                        {"detail": f"Déjà sorti par {holder.par_nom or 'un collègue'} le {timezone.localtime(holder.at):%d/%m/%Y à %H:%M}."},
                        status=status.HTTP_409_CONFLICT,
                    )
                if locked.status != "operationnel":
                    label = dict(Resource._meta.get_field("status").choices)[locked.status]
                    return Response({"detail": f"Sortie impossible : la ressource est « {label} »."}, status=status.HTTP_400_BAD_REQUEST)
            elif holder is None:
                return Response({"detail": "Cette ressource n'est pas sortie."}, status=status.HTTP_400_BAD_REQUEST)

            movement = ResourceMovement.objects.create(
                resource=locked,
                kind=kind,
                par=request.user,
                par_nom=_display_name(request.user),
                note=serializer.validated_data.get("note", ""),
                kilometrage=km,
            )
            if km is not None and locked.type == "vehicule":
                locked.kilometrage = km
                locked.kilometrage_date = timezone.localdate()
                locked.save(update_fields=["kilometrage", "kilometrage_date"])

        fresh = Resource.objects.prefetch_related("mouvements").get(pk=resource.pk)
        return Response(
            {
                "movement": ResourceMovementSerializer(movement).data,
                "sortie_courante": current_checkout(fresh),
                "kilometrage": fresh.kilometrage,
                "kilometrage_date": fresh.kilometrage_date,
            },
            status=status.HTTP_201_CREATED,
        )


class MaintenanceLogEntryViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceLogEntry.objects.select_related("resource").all()
    serializer_class = MaintenanceLogEntrySerializer
