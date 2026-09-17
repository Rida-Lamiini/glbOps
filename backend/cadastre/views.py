from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .db.geometry import list_all_lot_polygons_geojson, set_lot_geometry
from .db.lot_features import get_lot_feature_collection
from .geo.build_lot import build_lot_geometry
from .models import Borne, DistanceCheck, Lot, ReferencePoint
from .pdf.extract import OcrServiceError, extract_calcul_de_contenances
from .serializers import CreateLotSerializer, LotDetailSerializer, LotListSerializer

MAX_PDF_BYTES = 25 * 1024 * 1024


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def lots(request):
    if request.method == "GET":
        queryset = Lot.objects.all()
        search = request.query_params.get("q")
        if search:
            queryset = queryset.filter(
                Q(titre_foncier__icontains=search) | Q(propriete_dite__icontains=search)
            )
        return Response({"lots": LotListSerializer(queryset, many=True).data})

    serializer = CreateLotSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Geometry is always recomputed here from the submitted bornes — the client
    # never gets to assert a surface, a distance or a centroid.
    built = build_lot_geometry(
        data["bornes"], data.get("distance_checks") or [], data.get("reference_points") or []
    )

    with transaction.atomic():
        lot = Lot.objects.create(
            titre_foncier=data["titre_foncier"],
            propriete_dite=data["propriete_dite"],
            lot_number=data.get("lot_number", ""),
            affaire_ref=data.get("affaire_ref", ""),
            geometre=data.get("geometre", ""),
            date_leve=data.get("date_leve"),
            service_cadastre=data.get("service_cadastre", ""),
            surface_document_m2=data["surface_document_m2"],
            surface_calculee_m2=built.surface_calculee_m2,
            correction_lambert_m2=data["correction_lambert_m2"],
            source_pdf_url=data.get("source_pdf_url", ""),
        )

        Borne.objects.bulk_create(
            [
                Borne(
                    lot=lot,
                    name=b.name,
                    sequence=b.sequence,
                    x_lambert=b.x_lambert,
                    y_lambert=b.y_lambert,
                    lat=b.lat,
                    lng=b.lng,
                )
                for b in built.bornes
            ]
        )
        DistanceCheck.objects.bulk_create(
            [
                DistanceCheck(
                    lot=lot,
                    segment_label=dc.segment_label,
                    croquis_m=dc.croquis_m,
                    calcule_m=dc.calcule_m,
                    ecart_m=dc.ecart_m,
                )
                for dc in built.distance_checks
            ]
        )
        ReferencePoint.objects.bulk_create(
            [
                ReferencePoint(
                    lot=lot,
                    label=rp.label,
                    lat=rp.lat,
                    lng=rp.lng,
                    distance_m=rp.distance_m,
                    bearing_deg=rp.bearing_deg,
                )
                for rp in built.reference_points
            ]
        )

        if len(built.polygon_ring_lat_lng) >= 3:
            set_lot_geometry(lot.id, built.polygon_ring_lat_lng, built.centroid)

    return Response({"id": str(lot.id)}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lot_detail(request, pk):
    lot = get_object_or_404(
        Lot.objects.prefetch_related("bornes", "distance_checks", "reference_points"), pk=pk
    )
    return Response(LotDetailSerializer(lot).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lot_geojson(request, pk):
    lot = get_object_or_404(Lot.objects.prefetch_related("bornes", "reference_points"), pk=pk)
    return Response(get_lot_feature_collection(lot))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lots_geojson(request):
    """Every lot's polygon, for the overview map."""
    return Response(
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": row["polygon"],
                    "properties": {
                        "id": row["id"],
                        "titreFoncier": row["titre_foncier"],
                        "proprieteDite": row["propriete_dite"],
                    },
                }
                for row in list_all_lot_polygons_geojson()
            ],
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def parse_pdf(request):
    """Extract a "Calcul de Contenances" PDF. Reads only — nothing is saved."""
    uploaded = request.FILES.get("file")
    if uploaded is None:
        return Response({"error": "Aucun fichier PDF fourni."}, status=status.HTTP_400_BAD_REQUEST)
    if uploaded.content_type != "application/pdf":
        return Response({"error": "Le fichier doit être un PDF."}, status=status.HTTP_400_BAD_REQUEST)
    if uploaded.size > MAX_PDF_BYTES:
        return Response(
            {"error": f"Le PDF dépasse la taille maximale ({MAX_PDF_BYTES // (1024 * 1024)} Mo)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = extract_calcul_de_contenances(uploaded.read())
    except OcrServiceError as error:
        # The OCR service being down is an operational problem, not a bad
        # document — say so plainly instead of blaming the user's PDF.
        return Response({"error": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as error:  # noqa: BLE001 - surfaced to the user as a parse failure
        return Response(
            {
                "error": (
                    f"Échec de l'analyse du PDF ({error}). "
                    "Vous pouvez saisir les bornes manuellement."
                )
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    return Response(
        {
            "extraction_method": result.extraction_method,
            "header": {
                "propriete_dite": result.header.propriete_dite,
                "nature_affaire": result.header.nature_affaire,
                "titre_foncier": result.header.titre_foncier,
                "lot": result.header.lot,
                "systeme": result.header.systeme,
                "surface_calculee_m2": result.header.surface_calculee_m2,
                "correction_lambert_m2": result.header.correction_lambert_m2,
                "surface_corrigee_m2": result.header.surface_corrigee_m2,
                "contenance_adoptee_m2": result.header.contenance_adoptee_m2,
                "date": result.header.date,
                "geometre": result.header.geometre,
            },
            "bornes": [
                {
                    "name": b.name,
                    "sequence": b.sequence,
                    "x": b.x,
                    "y": b.y,
                    "flagged": b.flagged,
                    "flag_reason": b.flag_reason,
                }
                for b in result.bornes
            ],
            "raw_ocr_text": result.raw_ocr_text,
        }
    )
