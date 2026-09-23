from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from projets.models import HistoryEntry, Projet

from .db.geometry import copy_lot_geometry, find_lots_near, list_all_lot_polygons_geojson, set_lot_geometry
from .db.lot_features import get_lot_feature_collection
from .excel_import import MAX_BYTES as MAX_XLSX_BYTES, build_lots_export, build_template, parse_lots_workbook
from .geo.build_lot import build_lot_geometry
from .models import Borne, DistanceCheck, Lot, ReferencePoint
from .pdf.extract import OcrServiceError, extract_calcul_de_contenances
from .serializers import CreateLotSerializer, LotDetailSerializer, LotListSerializer

MAX_PDF_BYTES = 25 * 1024 * 1024

STATUT_HISTORY_LABELS = {"brouillon": "remis en brouillon", "verifie": "vérifié", "valide": "validé"}


def _display_name(user):
    if user is None:
        return ""
    employee = getattr(user, "employee", None)
    return employee.nom if employee else (user.first_name or user.username)


def _log_on_prestation(lot, label, user):
    """One line on the prestation's Historique for what happened to its lot — same DD/MM/YYYY
    date string the frontend writes. A lot with no prestation has nowhere to log."""
    if not lot.prestation_id:
        return
    HistoryEntry.objects.create(
        prestation_id=lot.prestation_id,
        date=timezone.localdate().strftime("%d/%m/%Y"),
        label=f"{label} — TF {lot.titre_foncier}",
        author=_display_name(user),
    )


def _save_lot(data, existing_lot=None, user=None):
    """Creates a new Lot, or overwrites an existing one in place — the same
    geometry recomputation either way, so a client never gets to assert a
    surface, a distance or a centroid; it only ever supplies bornes (and,
    optionally, distance checks / reference points) and everything derived
    gets rebuilt from those. On update, existing bornes/distance-checks/
    reference-points are replaced wholesale rather than diffed — simpler,
    and safe since the caller (the review UI) always submits the full set.
    """
    built = build_lot_geometry(
        data["bornes"], data.get("distance_checks") or [], data.get("reference_points") or []
    )

    field_values = dict(
        projet=data.get("projet"),
        prestation=data.get("prestation"),
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

    with transaction.atomic():
        if existing_lot is None:
            lot = Lot.objects.create(created_by=user, **field_values)
        else:
            lot = existing_lot
            was_reviewed = lot.statut != "brouillon"
            for field, value in field_values.items():
                setattr(lot, field, value)
            # An edited survey has to be reviewed again.
            lot.statut, lot.statut_par, lot.statut_at = "brouillon", None, None
            lot.save()
            lot.bornes.all().delete()
            lot.distance_checks.all().delete()
            lot.reference_points.all().delete()

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

        # validate_bornes on the serializer requires at least 3, so this ring
        # always has >= 3 points — never a stale polygon to clear on update.
        set_lot_geometry(lot.id, built.polygon_ring_lat_lng, built.centroid)

        if existing_lot is None:
            label = "Lot cadastral enregistré"
        else:
            label = "Lot cadastral modifié" + (" (repasse en brouillon)" if was_reviewed else "")
        _log_on_prestation(lot, label, user)

    return lot


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def lots(request):
    if request.method == "GET":
        queryset = Lot.objects.select_related("created_by", "statut_par")
        search = request.query_params.get("q")
        if search:
            queryset = queryset.filter(
                Q(titre_foncier__icontains=search) | Q(propriete_dite__icontains=search)
            )
        return Response({"lots": LotListSerializer(queryset, many=True).data})

    serializer = CreateLotSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    lot = _save_lot(serializer.validated_data, user=request.user)
    return Response({"id": str(lot.id)}, status=status.HTTP_201_CREATED)


def _lot_summary(lot, distance_m=None):
    return {
        "id": str(lot.id),
        "titre_foncier": lot.titre_foncier,
        "propriete_dite": lot.propriete_dite,
        "projet": lot.projet_id,
        "surface_document_m2": lot.surface_document_m2,
        "nb_bornes": lot.bornes.count(),
        "created_at": lot.created_at,
        "distance_m": distance_m,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lot_matches(request):
    """Earlier lots worth reusing on a projet: same titre foncier, or close by.

    Query: ``titre`` (optional), ``lat``/``lng`` (optional), ``radius`` metres
    (default 200), ``projet`` (a projet whose own lots are left out).
    """
    projet = request.query_params.get("projet")
    titre = (request.query_params.get("titre") or "").strip()
    base = Lot.objects.prefetch_related("bornes")
    if projet:
        base = base.exclude(projet_id=projet)

    same = [_lot_summary(lot) for lot in base.filter(titre_foncier__iexact=titre)] if titre else []

    nearby = []
    try:
        lat = float(request.query_params["lat"])
        lng = float(request.query_params["lng"])
        radius = min(float(request.query_params.get("radius", 200)), 2000)
    except (KeyError, ValueError):
        lat = lng = None
    if lat is not None:
        same_ids = {row["id"] for row in same}
        hits = [h for h in find_lots_near(lat, lng, radius) if h["id"] not in same_ids]
        by_id = {str(lot.id): lot for lot in base.filter(pk__in=[h["id"] for h in hits])}
        nearby = [_lot_summary(by_id[h["id"]], h["distance_m"]) for h in hits if h["id"] in by_id]

    return Response({"same_titre": same, "nearby": nearby})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def lot_reuse(request, pk):
    """Bring an earlier lot onto a projet.

    A lot that belongs to no projet yet is simply attached. One that already
    belongs to another projet is copied (bornes, distance checks, reference
    points and polygon) and the copy remembers its origin in ``derive_de``, so
    the original survey is never altered.
    """
    source = get_object_or_404(Lot.objects.prefetch_related("bornes", "distance_checks", "reference_points"), pk=pk)
    projet = get_object_or_404(Projet, pk=request.data.get("projet"))

    existing = Lot.objects.filter(titre_foncier=source.titre_foncier, projet=projet).first()
    if existing:
        return Response({"id": str(existing.id), "mode": "existing"})

    if source.projet_id is None:
        source.projet = projet
        source.save(update_fields=["projet", "updated_at"])
        return Response({"id": str(source.id), "mode": "attached"})

    with transaction.atomic():
        copy = Lot.objects.create(
            projet=projet,
            derive_de=source,
            created_by=request.user,
            titre_foncier=source.titre_foncier,
            propriete_dite=source.propriete_dite,
            lot_number=source.lot_number,
            affaire_ref=source.affaire_ref,
            geometre=source.geometre,
            date_leve=source.date_leve,
            service_cadastre=source.service_cadastre,
            surface_document_m2=source.surface_document_m2,
            surface_calculee_m2=source.surface_calculee_m2,
            correction_lambert_m2=source.correction_lambert_m2,
            source_pdf_url=source.source_pdf_url,
        )
        Borne.objects.bulk_create(
            [Borne(lot=copy, name=b.name, sequence=b.sequence, x_lambert=b.x_lambert, y_lambert=b.y_lambert, lat=b.lat, lng=b.lng) for b in source.bornes.all()]
        )
        DistanceCheck.objects.bulk_create(
            [DistanceCheck(lot=copy, segment_label=d.segment_label, croquis_m=d.croquis_m, calcule_m=d.calcule_m, ecart_m=d.ecart_m) for d in source.distance_checks.all()]
        )
        ReferencePoint.objects.bulk_create(
            [ReferencePoint(lot=copy, label=r.label, lat=r.lat, lng=r.lng, distance_m=r.distance_m, bearing_deg=r.bearing_deg) for r in source.reference_points.all()]
        )
        copy_lot_geometry(source.id, copy.id)
    return Response({"id": str(copy.id), "mode": "copied"}, status=status.HTTP_201_CREATED)


# Who may move a lot to which review status. Bureau prepares and verifies; the controle
# agent (and office) validates. Anyone may put a lot back to brouillon.
STATUT_ROLES = {
    "verifie": {"Agent Bureau", "Agent Contrôle", "Dispatcher", "Directrice"},
    "valide": {"Agent Contrôle", "Dispatcher", "Directrice"},
}


def _role_of(user):
    employee = getattr(user, "employee", None)
    if employee is not None:
        return employee.role
    return "Directrice" if user.is_superuser else "Dispatcher"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def lot_statut(request, pk):
    """Body: ``{"statut": "brouillon" | "verifie" | "valide"}``."""
    lot = get_object_or_404(Lot, pk=pk)
    statut = request.data.get("statut")
    if statut not in ("brouillon", "verifie", "valide"):
        return Response({"statut": "Statut inconnu."}, status=status.HTTP_400_BAD_REQUEST)
    if statut in STATUT_ROLES and _role_of(request.user) not in STATUT_ROLES[statut]:
        return Response({"detail": "Votre rôle ne permet pas ce changement de statut."}, status=status.HTTP_403_FORBIDDEN)
    if statut == "valide" and lot.statut != "verifie":
        return Response({"detail": "Un lot doit être vérifié avant d'être validé."}, status=status.HTTP_400_BAD_REQUEST)
    changed = lot.statut != statut
    lot.statut = statut
    lot.statut_par = None if statut == "brouillon" else request.user
    lot.statut_at = None if statut == "brouillon" else timezone.now()
    lot.save(update_fields=["statut", "statut_par", "statut_at", "updated_at"])
    if changed:
        _log_on_prestation(lot, f"Lot cadastral {STATUT_HISTORY_LABELS[statut]}", request.user)
    return Response(LotListSerializer(lot).data)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def lot_detail(request, pk):
    lot = get_object_or_404(
        Lot.objects.prefetch_related("bornes", "distance_checks", "reference_points"), pk=pk
    )

    if request.method == "DELETE":
        _log_on_prestation(lot, "Lot cadastral supprimé", request.user)
        lot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == "PUT":
        serializer = CreateLotSerializer(data=request.data, context={"lot_id": lot.id})
        serializer.is_valid(raise_exception=True)
        _save_lot(serializer.validated_data, existing_lot=lot, user=request.user)
        # bornes/distance_checks/reference_points were deleted and recreated
        # inside _save_lot — re-fetch rather than trust lot's prefetch cache,
        # which still holds the pre-update rows.
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
    """Every lot's polygon, for the overview map, with what the map needs to colour and describe it."""
    lots = {str(l.id): l for l in Lot.objects.all()}
    features = []
    for row in list_all_lot_polygons_geojson():
        lot = lots.get(row["id"])
        props = {
            "id": row["id"],
            "titreFoncier": row["titre_foncier"],
            "proprieteDite": row["propriete_dite"],
            "projetId": row["projet_id"],
        }
        if lot is not None:
            props.update(
                {
                    "statut": lot.statut,
                    "conforme": LotListSerializer().get_conforme(lot),
                    "surfaceCalculeeM2": float(lot.surface_calculee_m2),
                    "surfaceDocumentM2": float(lot.surface_document_m2),
                }
            )
        features.append({"type": "Feature", "geometry": row["polygon"], "properties": props})
    return Response({"type": "FeatureCollection", "features": features})


XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def parse_excel(request):
    """Read an Excel workbook of lots (sheets "Lots" and "Bornes"). Reads only — nothing is saved."""
    uploaded = request.FILES.get("file")
    if uploaded is None:
        return Response({"error": "Aucun fichier Excel fourni."}, status=status.HTTP_400_BAD_REQUEST)
    if not uploaded.name.lower().endswith(".xlsx"):
        return Response({"error": "Le fichier doit être un classeur Excel (.xlsx)."}, status=status.HTTP_400_BAD_REQUEST)
    if uploaded.size > MAX_XLSX_BYTES:
        return Response(
            {"error": f"Le fichier dépasse la taille maximale ({MAX_XLSX_BYTES // (1024 * 1024)} Mo)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        return Response(parse_lots_workbook(uploaded.read()))
    except ValueError as error:
        return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def excel_template(request):
    """The blank workbook to fill in, with two example lots and the instructions."""
    response = HttpResponse(build_template(), content_type=XLSX_CONTENT_TYPE)
    response["Content-Disposition"] = 'attachment; filename="modele-import-lots.xlsx"'
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_excel(request):
    """All current lots (optionally ?q= filtered, same search as the list) as a workbook — the
    reverse of parse_excel/excel_template, for an offline copy or handing lots to a client."""
    queryset = Lot.objects.prefetch_related("bornes").order_by("titre_foncier")
    search = request.query_params.get("q")
    if search:
        queryset = queryset.filter(Q(titre_foncier__icontains=search) | Q(propriete_dite__icontains=search))
    response = HttpResponse(build_lots_export(queryset), content_type=XLSX_CONTENT_TYPE)
    response["Content-Disposition"] = 'attachment; filename="lots-cadastraux.xlsx"'
    return response


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
