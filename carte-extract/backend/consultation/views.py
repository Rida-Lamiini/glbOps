import base64
import csv
import io

from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from shapely.geometry import mapping

from cadastre.geo.proj import lambert_to_wgs84
from core.permissions import is_office

from . import notifications
from .batch import build_workbook, run_batch
from .dataset import load_entries
from .engine import MAX_RADIUS_M, consult, layer_neighbours, plan_route, query_geometry
from .geo import haversine_m, ring_polygon
from .models import Consultation, ProximityNotification, ReferenceLayer, ReferenceParcel
from .parsers import ParseError, parse_bytes, parse_text
from .report import build_report

MAX_UPLOAD = 5_000_000
MAX_PARCELS_INTERACTIVE = 50


def _bad(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _float(value, name):
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        raise ValueError(f"{name} invalide.")


def _position(data):
    """(lat, lng, ring) from a request body: lat/lng, Lambert x/y(+zone) or a ring of [lat, lng]."""
    if data.get("ring"):
        ring = [(_float(p[0], "latitude"), _float(p[1], "longitude")) for p in data["ring"]]
        return None, None, ring
    if data.get("x") not in (None, "") and data.get("y") not in (None, ""):
        zone = data.get("zone") if data.get("zone") in ("nord", "sud") else "nord"
        lat, lng = lambert_to_wgs84(_float(data["x"], "X"), _float(data["y"], "Y"), zone)
        return lat, lng, None
    if data.get("lat") not in (None, "") and data.get("lng") not in (None, ""):
        return _float(data["lat"], "Latitude"), _float(data["lng"], "Longitude"), None
    raise ValueError("Indiquez une position (carte, latitude/longitude ou X/Y Lambert).")


def _log(user, kind, label, result=None, *, lat=None, lng=None, titre="", radius=0, source="", found=None, alerts=None, st="ok"):
    s = result["summary"] if result else {}
    q = result["query"] if result else {}
    Consultation.objects.create(
        user=user, username=user.get_username(), kind=kind, label=label[:300], titre=(titre or q.get("titre") or "")[:100],
        lat=q.get("lat", lat), lng=q.get("lng", lng), radius_m=int(q.get("radius_m", radius) or 0),
        n_found=s.get("count", found or 0), n_alerts=len(result["alerts"]) if result else (alerts or 0),
        status=s.get("status", st), source_file=source[:200],
    )


def _run(request, data):
    lat, lng, ring = _position(data)
    titre = (data.get("titre") or "").strip()
    result = consult(request.user, lat=lat, lng=lng, ring=ring, titre=titre or None, radius_m=data.get("radius") or 200,
                     exclude_projet_id=data.get("exclude_projet_id") or None)
    geom, lat0, lng0 = query_geometry(lat, lng, ring)
    result["reference"] = layer_neighbours(geom, lat0, lng0, result["query"]["radius_m"])
    return result


class ConsultView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            result = _run(request, request.data)
        except ValueError as exc:
            return _bad(str(exc))
        kind = "titre" if request.data.get("titre") and not request.data.get("ring") and request.data.get("kind") == "titre" else request.data.get("kind") or "position"
        _log(request.user, kind if kind in dict(Consultation.KIND_CHOICES) else "position",
             request.data.get("label") or f"{result['query']['lat']:.5f}, {result['query']['lng']:.5f}", result)
        return Response(result)


class ConsultFileView(APIView):
    """A file or pasted text (ANCFCC bornes…) -> its parcels, each consulted."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        zone, mode = request.data.get("zone") or "nord", request.data.get("mode") or "auto"
        try:
            radius = _float(request.data.get("radius") or 200, "Rayon")
            parcels, source = _read_parcels(request, zone, mode)
        except (ParseError, ValueError) as exc:
            return _bad(str(exc))
        entries = load_entries(request.user)
        out = []
        for p in parcels[:MAX_PARCELS_INTERACTIVE]:
            first = p.bornes[0]
            res = consult(request.user, ring=p.ring if p.kind == "polygon" else None, lat=first["lat"], lng=first["lng"],
                          titre=p.titre or None, radius_m=radius, entries=entries)
            geom, lat0, lng0 = query_geometry(first["lat"], first["lng"], p.ring if p.kind == "polygon" else None)
            res["reference"] = layer_neighbours(geom, lat0, lng0, res["query"]["radius_m"])
            out.append({"parcel": p.to_dict(), "result": res})
            _log(request.user, "parcelle", p.name or source, res, source=source)
        return Response({"parcels": out, "truncated": len(parcels) > MAX_PARCELS_INTERACTIVE, "total": len(parcels)})


def _read_parcels(request, zone, mode):
    upload = request.FILES.get("file")
    if upload is not None:
        if upload.size > MAX_UPLOAD:
            raise ValueError("Fichier trop volumineux (5 Mo max).")
        data = upload.read()
        parcels, _ = parse_bytes(upload.name, data, zone, mode)
        return parcels, upload.name
    text = request.data.get("text") or ""
    if not text.strip():
        raise ValueError("Joignez un fichier ou collez le texte de la mappe.")
    parcels = parse_text(text, zone, mode)
    if not parcels:
        raise ParseError("Aucune coordonnée trouvée dans le texte.")
    return parcels, "texte collé"


class ReportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            result = _run(request, request.data)
        except ValueError as exc:
            return _bad(str(exc))
        png = None
        raw = request.data.get("map_png") or ""
        if raw:
            try:
                png = base64.b64decode(raw.split(",", 1)[-1], validate=False)
            except Exception:
                png = None
        pdf = build_report(result, user_label=request.user.get_username(), map_png=png, title=request.data.get("label") or "")
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="Consultation.pdf"'
        return response


class BatchView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        zone, mode = request.data.get("zone") or "nord", request.data.get("mode") or "points"
        try:
            radius = _float(request.data.get("radius") or 200, "Rayon")
            parcels, source = _read_parcels(request, zone, mode)
        except (ParseError, ValueError) as exc:
            return _bad(str(exc))
        radius = max(10, min(radius, MAX_RADIUS_M))
        results = run_batch(request.user, parcels, radius)
        _log(request.user, "batch", f"{len(results)} parcelles", source=source, found=sum(r["summary"]["count"] for _, r in results),
             alerts=sum(len(r["alerts"]) for _, r in results), radius=int(radius),
             st="danger" if any(r["summary"]["status"] == "danger" for _, r in results) else "warning" if any(r["alerts"] for _, r in results) else "ok")
        xlsx = build_workbook(results, radius, source)
        response = HttpResponse(xlsx, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = 'attachment; filename="Consultation-par-lot.xlsx"'
        return response


class NearView(APIView):
    """Projets around a phone's position, nearest first (field agents: 'what is around me')."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            lat, lng = _float(request.data.get("lat"), "Latitude"), _float(request.data.get("lng"), "Longitude")
            radius = max(50, min(_float(request.data.get("radius") or 1000, "Rayon"), MAX_RADIUS_M * 4))
        except ValueError as exc:
            return _bad(str(exc))
        only_open = bool(request.data.get("only_open"))
        out = []
        for e in load_entries(request.user):
            if e.geom is None or (only_open and e.delivered):
                continue
            c = e.geom.centroid
            d = haversine_m(lat, lng, c.y, c.x)
            if d <= radius:
                out.append({"projet_id": e.projet_id, "label": e.label, "client": e.client, "situation": e.situation,
                            "lat": c.y, "lng": c.x, "distance_m": round(d), "delivered": e.delivered,
                            "stage": e.prestations[0]["stage"] if e.prestations else ""})
        out.sort(key=lambda x: x["distance_m"])
        return Response({"results": out[:100], "radius_m": radius})


class RouteView(APIView):
    """One trip through several projets: start point + stops, ordered shortest-first."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            start = {"lat": _float(request.data["start"]["lat"], "Latitude"), "lng": _float(request.data["start"]["lng"], "Longitude")}
        except (KeyError, TypeError, ValueError):
            return _bad("Point de départ invalide.")
        ids = [str(i) for i in request.data.get("projet_ids") or []][:40]
        by_id = {e.projet_id: e for e in load_entries(request.user) if e.projet_id and e.geom is not None}
        stops = []
        for pid in ids:
            e = by_id.get(pid)
            if e:
                c = e.geom.centroid
                stops.append({"projet_id": pid, "label": e.label, "client": e.client, "lat": c.y, "lng": c.x})
        if not stops:
            return _bad("Aucun projet localisé à visiter.")
        return Response(plan_route(start, stops))


def _notif_json(n, user):
    return {"id": n.id, "projet_id": n.projet_id, "other_projet_id": n.other_projet_id, "severity": n.severity,
            "title": n.title, "message": n.message, "distance_m": n.distance_m, "created_at": n.created_at,
            "read": n.read_by.filter(pk=user.pk).exists()}


class NotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        allowed = None if is_office(request.user) else {e.projet_id for e in load_entries(request.user)}
        qs = ProximityNotification.objects.all()[:60]
        items = [_notif_json(n, request.user) for n in qs if allowed is None or n.projet_id in allowed]
        return Response({"results": items, "unread": sum(1 for i in items if not i["read"])})


class NotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ids = request.data.get("ids")
        qs = ProximityNotification.objects.all() if not ids else ProximityNotification.objects.filter(pk__in=ids)
        for n in qs:
            n.read_by.add(request.user)
        return Response({"ok": True})


class NotificationsScanView(APIView):
    """Evaluate projets located since the last scan (e.g. after an import) — office only."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_office(request.user):
            return _bad("Réservé à la direction.", status.HTTP_403_FORBIDDEN)
        return Response({"created": len(notifications.scan_all())})


# ---------------------------------------------------------------------------------------------- reference layers
def _layer_json(layer):
    return {"id": layer.id, "name": layer.name, "note": layer.note, "count": layer.parcels.count(), "created_at": layer.created_at}


class LayersView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        return Response({"results": [_layer_json(l) for l in ReferenceLayer.objects.all()]})

    def post(self, request):
        if not is_office(request.user):
            return _bad("Réservé à la direction.", status.HTTP_403_FORBIDDEN)
        zone, mode = request.data.get("zone") or "nord", "polygon"
        try:
            parcels, source = _read_parcels(request, zone, mode)
        except (ParseError, ValueError) as exc:
            return _bad(str(exc))
        layer = ReferenceLayer.objects.create(name=(request.data.get("name") or source)[:200], note=(request.data.get("note") or "")[:300], created_by=request.user)
        n = 0
        for p in parcels:
            if p.kind == "polygon":
                poly = ring_polygon(p.ring)
                geom = mapping(poly) if poly is not None else None
            elif p.kind == "line":
                geom = {"type": "LineString", "coordinates": [[b["lng"], b["lat"]] for b in p.bornes]}
            else:
                geom = {"type": "Point", "coordinates": [p.bornes[0]["lng"], p.bornes[0]["lat"]]}
            if geom:
                ReferenceParcel.objects.create(layer=layer, name=p.name[:200], titre=p.titre[:100], geometry=_plain(geom),
                                               declared_surface_m2=p.declared_surface_m2)
                n += 1
        if not n:
            layer.delete()
            return _bad("Aucune parcelle exploitable dans ce fichier.")
        return Response(_layer_json(layer), status=status.HTTP_201_CREATED)


def _plain(geom):
    """shapely mapping() returns tuples; JSON needs lists."""
    import json

    return json.loads(json.dumps(geom))


class LayerDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not is_office(request.user):
            return _bad("Réservé à la direction.", status.HTTP_403_FORBIDDEN)
        ReferenceLayer.objects.filter(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LayersGeoJSONView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        feats = [{"type": "Feature", "geometry": p.geometry, "properties": {"id": p.id, "name": p.name, "titre": p.titre, "layer": p.layer.name}}
                 for p in ReferenceParcel.objects.select_related("layer")]
        return Response({"type": "FeatureCollection", "features": feats})


# ---------------------------------------------------------------------------------------------------- history
def _history_qs(request):
    qs = Consultation.objects.all()
    if not is_office(request.user):
        qs = qs.filter(user=request.user)
    if request.query_params.get("mine"):
        qs = qs.filter(user=request.user)
    return qs


def _hist_json(c):
    return {"id": c.id, "username": c.username, "kind": c.kind, "label": c.label, "titre": c.titre, "lat": c.lat, "lng": c.lng,
            "radius_m": c.radius_m, "n_found": c.n_found, "n_alerts": c.n_alerts, "status": c.status, "source_file": c.source_file,
            "created_at": c.created_at}


class HistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _history_qs(request)
        q = (request.query_params.get("q") or "").strip()
        if q:
            from django.db.models import Q

            qs = qs.filter(Q(label__icontains=q) | Q(titre__icontains=q) | Q(username__icontains=q) | Q(source_file__icontains=q))
        return Response({"results": [_hist_json(c) for c in qs[:300]], "scope": "all" if is_office(request.user) else "mine"})


class HistoryCsvView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Date", "Utilisateur", "Type", "Recherche", "Titre", "Latitude", "Longitude", "Rayon m", "Projets trouvés", "Alertes", "Verdict", "Fichier"])
        for c in _history_qs(request):
            w.writerow([c.created_at.strftime("%Y-%m-%d %H:%M"), c.username, c.kind, c.label, c.titre, c.lat, c.lng, c.radius_m, c.n_found, c.n_alerts, c.status, c.source_file])
        response = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="Historique-consultations.csv"'
        return response
