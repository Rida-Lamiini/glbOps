"""Recomputes a lot's full geometry from its bornes.

Single source of truth for both manual entry and PDF-review submission, so
every save path verifies the same way.
"""

from dataclasses import dataclass

from .calculations import (
    centroid_of_lambert_ring,
    distance_and_bearing,
    is_distance_conforme,
    planar_distance_m,
    planar_perimeter_m,
    planar_shoelace_area_m2,
)
from .proj import lambert_to_wgs84


@dataclass
class BuiltBorne:
    name: str
    sequence: int
    x_lambert: float
    y_lambert: float
    lat: float
    lng: float


@dataclass
class BuiltDistanceCheck:
    segment_label: str
    croquis_m: float
    calcule_m: float
    ecart_m: float
    conforme: bool


@dataclass
class BuiltReferencePoint:
    label: str
    lat: float
    lng: float
    distance_m: float
    bearing_deg: float


@dataclass
class BuiltLotGeometry:
    bornes: list[BuiltBorne]
    polygon_ring_lat_lng: list[tuple[float, float]]
    centroid: tuple[float, float]
    surface_calculee_m2: float
    perimeter_m: float
    distance_checks: list[BuiltDistanceCheck]
    reference_points: list[BuiltReferencePoint]


def _find_borne(bornes: list[dict], name: str) -> dict | None:
    normalized = name.strip().lower()
    for b in bornes:
        if b["name"].strip().lower() == normalized:
            return b
    return None


def build_lot_geometry(
    bornes_input: list[dict],
    distance_checks_input: list[dict],
    reference_points_input: list[dict],
) -> BuiltLotGeometry:
    ordered = sorted(bornes_input, key=lambda b: b["sequence"])
    ring = [(b["x_lambert"], b["y_lambert"]) for b in ordered]

    surface_calculee_m2 = planar_shoelace_area_m2(ring)
    perimeter_m = planar_perimeter_m(ring)
    centroid = centroid_of_lambert_ring(ring)

    bornes = []
    for b in ordered:
        lat, lng = lambert_to_wgs84(b["x_lambert"], b["y_lambert"])
        bornes.append(
            BuiltBorne(
                name=b["name"],
                sequence=b["sequence"],
                x_lambert=b["x_lambert"],
                y_lambert=b["y_lambert"],
                lat=lat,
                lng=lng,
            )
        )
    polygon_ring_lat_lng = [(b.lat, b.lng) for b in bornes]

    distance_checks = []
    for dc in distance_checks_input:
        parts = [s.strip() for s in dc["segment_label"].split("-")]
        from_borne = _find_borne(bornes_input, parts[0] if len(parts) > 0 else "")
        to_borne = _find_borne(bornes_input, parts[1] if len(parts) > 1 else "")
        # A segment label naming a borne that isn't in the table can't be
        # measured; NaN carries that through to an ecart that never reads as
        # conforme, rather than silently scoring it as a 0 m deviation.
        if from_borne and to_borne:
            calcule_m = planar_distance_m(
                (from_borne["x_lambert"], from_borne["y_lambert"]),
                (to_borne["x_lambert"], to_borne["y_lambert"]),
            )
        else:
            calcule_m = float("nan")
        ecart_m = calcule_m - dc["croquis_m"]
        distance_checks.append(
            BuiltDistanceCheck(
                segment_label=dc["segment_label"],
                croquis_m=dc["croquis_m"],
                calcule_m=calcule_m,
                ecart_m=ecart_m,
                conforme=is_distance_conforme(ecart_m),
            )
        )

    reference_points = []
    for rp in reference_points_input:
        distance_m, bearing_deg = distance_and_bearing(
            centroid[0], centroid[1], rp["lat"], rp["lng"]
        )
        reference_points.append(
            BuiltReferencePoint(
                label=rp["label"],
                lat=rp["lat"],
                lng=rp["lng"],
                distance_m=distance_m,
                bearing_deg=bearing_deg,
            )
        )

    return BuiltLotGeometry(
        bornes=bornes,
        polygon_ring_lat_lng=polygon_ring_lat_lng,
        centroid=centroid,
        surface_calculee_m2=surface_calculee_m2,
        perimeter_m=perimeter_m,
        distance_checks=distance_checks,
        reference_points=reference_points,
    )


# A 1 m^2 tolerance is not geometry-independent: how large a single-vertex
# coordinate error has to be before it moves the shoelace area by 1 m^2
# depends on that vertex's neighbours (shoelace_area_sensitivity in
# calculations.py - dArea/dy_i shrinks toward zero as its neighbours' X
# values converge, same for dArea/dx_i and neighbour Y). Checked against the
# original 9-borne test lot: worst case ~0.17 m minimum-detectable error,
# comfortably under the ~3 m real OCR error it caught - but a thinner or more
# degenerate lot shape could have a much larger blind spot at some vertex.
# Don't assume this tolerance catches every possible single-borne error on
# every lot shape without checking shoelace_area_sensitivity for that lot first.
SURFACE_CONFORMITY_TOLERANCE_M2 = 1.0


def is_surface_conforme(
    surface_calculee_m2: float, correction_lambert_m2: float, surface_document_m2: float
) -> bool:
    ecart = surface_calculee_m2 + correction_lambert_m2 - surface_document_m2
    return abs(ecart) <= SURFACE_CONFORMITY_TOLERANCE_M2
