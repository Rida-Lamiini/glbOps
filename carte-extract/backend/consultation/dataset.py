"""Loads every projet's footprint (and its lots/prestations) as shapely geometries for a consultation.

A projet's geometry is, in order of trust: its drawn boundary, the union of its lots' polygons, its pin.
Non-office users only see the projets they are assigned to, like the rest of the app.
"""

from dataclasses import dataclass, field

from django.db.models import Q
from shapely.geometry import Point, shape
from shapely.ops import unary_union

from cadastre.db.geometry import list_all_lot_polygons_geojson
from cadastre.models import Lot
from core.permissions import is_office
from projets.models import Prestation, Projet

from .geo import largest_polygon


@dataclass
class Entry:
    projet_id: str | None
    label: str
    client: str = ""
    situation: str = ""
    titres: list = field(default_factory=list)
    geom: object = None  # shapely, WGS84 (lng, lat)
    geom_kind: str = "pin"  # boundary | lots | pin
    lots: list = field(default_factory=list)
    prestations: list = field(default_factory=list)
    delivered: bool = False
    validated: bool = False


def norm_titre(value):
    """'T 98525/03' / 't98525-03' -> 'T98525/03': titres are compared without spacing or case."""
    s = "".join(str(value or "").upper().split()).replace("-", "/")
    return s


def visible_projet_ids(user):
    """None = everything (office); else the set of projet ids the user is assigned to."""
    if is_office(user):
        return None
    emp = user.employee
    q = Q(agent_chantier=emp) | Q(agent_bureau=emp) | Q(agent_controle=emp)
    return set(Prestation.objects.filter(q).values_list("projet_id", flat=True))


def load_entries(user=None, only_projet_ids=None):
    allowed = visible_projet_ids(user) if user is not None else None
    projets = {p.id: p for p in Projet.objects.select_related("client")}
    lots_by_projet, orphans = {}, []
    for lot in Lot.objects.all().only("id", "titre_foncier", "propriete_dite", "statut", "projet_id", "prestation_id"):
        (lots_by_projet.setdefault(lot.projet_id, []) if lot.projet_id else orphans).append(lot)
    polygons = {g["id"]: g for g in list_all_lot_polygons_geojson()}
    presta_by_projet = {}
    for pr in Prestation.objects.all().only("id", "projet_id", "nature_demandee", "stage", "chemin"):
        presta_by_projet.setdefault(pr.projet_id, []).append(pr)

    def lot_info(lot):
        return {"id": str(lot.id), "titre": lot.titre_foncier, "propriete": lot.propriete_dite, "statut": lot.statut,
                "prestation_id": lot.prestation_id}

    entries = []
    for pid, projet in projets.items():
        if allowed is not None and pid not in allowed:
            continue
        if only_projet_ids is not None and pid not in only_projet_ids:
            continue
        lots = lots_by_projet.get(pid, [])
        presta = presta_by_projet.get(pid, [])
        geom, kind = None, "pin"
        if projet.boundary:
            try:
                geom = largest_polygon(shape(projet.boundary).buffer(0))
                kind = "boundary"
            except Exception:
                geom = None
        if geom is None:
            polys = []
            for lot in lots:
                g = polygons.get(str(lot.id))
                if g:
                    polys.append(shape(g["polygon"]))
            if polys:
                geom, kind = unary_union(polys).buffer(0), "lots"
        if geom is None and projet.lat is not None and projet.lng is not None:
            geom, kind = Point(projet.lng, projet.lat), "pin"
        titres = [t for t in {norm_titre(projet.reference_fonciere), *[norm_titre(l.titre_foncier) for l in lots]} if t]
        entries.append(Entry(
            projet_id=pid, label=projet.reference_fonciere or projet.situation or pid, client=projet.client.nom,
            situation=projet.situation, titres=sorted(titres), geom=geom, geom_kind=kind,
            lots=[lot_info(l) for l in lots],
            prestations=[{"id": p.id, "nature": p.nature_demandee, "stage": p.stage, "chemin": p.chemin} for p in presta],
            delivered=any(p.stage == "livraison" for p in presta),
            validated=any(l.statut == "valide" for l in lots),
        ))
    if allowed is None and only_projet_ids is None:
        for lot in orphans:
            g = polygons.get(str(lot.id))
            if not g:
                continue
            entries.append(Entry(
                projet_id=None, label=lot.titre_foncier, titres=[norm_titre(lot.titre_foncier)],
                geom=shape(g["polygon"]).buffer(0), geom_kind="lots", lots=[lot_info(lot)],
                validated=lot.statut == "valide",
            ))
    return entries
