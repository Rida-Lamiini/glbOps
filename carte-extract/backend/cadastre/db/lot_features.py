"""Assembles a lot's polygon, bornes and reference points into one GeoJSON
FeatureCollection — the single payload the map component consumes.
"""

from ..models import Lot
from .geometry import get_lot_geometry_geojson


def get_lot_feature_collection(lot: Lot) -> dict:
    geometry = get_lot_geometry_geojson(lot.id)
    features = []

    if geometry:
        features.append(
            {
                "type": "Feature",
                "geometry": geometry["polygon"],
                "properties": {
                    "kind": "polygon",
                    "id": str(lot.id),
                    "titreFoncier": lot.titre_foncier,
                },
            }
        )

    for borne in lot.bornes.all():
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(borne.lng), float(borne.lat)]},
                "properties": {
                    "kind": "borne",
                    "name": borne.name,
                    "xLambert": float(borne.x_lambert),
                    "yLambert": float(borne.y_lambert),
                    "lat": float(borne.lat),
                    "lng": float(borne.lng),
                },
            }
        )

    centroid_coords = geometry["centroid"]["coordinates"] if geometry else None
    for rp in lot.reference_points.all():
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(rp.lng), float(rp.lat)]},
                "properties": {
                    "kind": "reference-point",
                    "label": rp.label,
                    "distanceM": float(rp.distance_m),
                    "bearingDeg": float(rp.bearing_deg),
                    # The map draws a dashed line from each reference point back
                    # to the lot centroid, so it needs the centroid on the
                    # feature itself rather than fetching it separately.
                    "centroidLat": centroid_coords[1] if centroid_coords else None,
                    "centroidLng": centroid_coords[0] if centroid_coords else None,
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}
