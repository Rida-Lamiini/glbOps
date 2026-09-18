"""Geometry math for cadastral lots.

Area and perimeter are plain shoelace/Euclidean math on the Lambert plane,
not geodesic: that is what actually matches how the ANCFCC document
computes area from bornes. Feeding raw Lambert meters (x ~ 500000) to a
geodesic area routine that assumes lon/lat degrees would fold them through
cos/sin as bogus "degrees" and produce garbage, not a scaled planar area.
Only genuinely geographic operations (distance/bearing to a real-world
reference point) use spherical math on WGS84 lat/lng.
"""

import math

from .proj import lambert_to_wgs84

# Mean earth radius, matching the value Turf.js used in the original
# implementation, so distances stay identical to what was reviewed there.
EARTH_RADIUS_M = 6371008.8


def _close_ring(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not ring:
        return ring
    if ring[0] == ring[-1]:
        return ring
    return [*ring, ring[0]]


def _open_ring(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Ring without its duplicated closing vertex, if it has one."""
    if len(ring) > 1 and ring[0] == ring[-1]:
        return ring[:-1]
    return ring


def planar_shoelace_area_m2(ring: list[tuple[float, float]]) -> float:
    """Planar shoelace area (m^2) of a Lambert-plane ring, in borne sequence order."""
    closed = _close_ring(ring)
    twice_area = 0.0
    for (ax, ay), (bx, by) in zip(closed, closed[1:]):
        twice_area += ax * by - bx * ay
    return abs(twice_area) / 2


def shoelace_area_sensitivity(ring: list[tuple[float, float]]) -> list[dict]:
    """Per-vertex partial derivatives of the shoelace area.

    dArea/dx_i = (y_{i+1} - y_{i-1}) / 2 and dArea/dy_i = (x_{i-1} - x_{i+1}) / 2
    (standard shoelace derivatives). This is what an area cross-check
    tolerance implicitly relies on: a vertex whose two neighbours are close
    together in Y has a near-zero dAreaPerDx, so an X error there can be
    arbitrarily large and still hide under the tolerance (mirrored for
    dAreaPerDy and close-together neighbour X). Use this to find those blind
    spots for a given ring before trusting an area check to catch every
    possible single-vertex error.
    """
    n = len(ring)
    if n < 3:
        return []
    out = []
    for i in range(n):
        prev_x, prev_y = ring[(i - 1) % n]
        next_x, next_y = ring[(i + 1) % n]
        out.append(
            {
                "index": i,
                "d_area_per_dx": (next_y - prev_y) / 2,
                "d_area_per_dy": (prev_x - next_x) / 2,
            }
        )
    return out


def planar_distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Euclidean distance (m) between two Lambert-plane points."""
    return math.hypot(b[0] - a[0], b[1] - a[1])


def planar_perimeter_m(ring: list[tuple[float, float]]) -> float:
    """Sum of consecutive borne-to-borne distances, closing back to the first borne."""
    closed = _close_ring(ring)
    return sum(planar_distance_m(a, b) for a, b in zip(closed, closed[1:]))


def centroid_of_lambert_ring(ring: list[tuple[float, float]]) -> tuple[float, float]:
    """Arithmetic-mean centroid of the ring's vertices, returned as WGS84 (lat, lng).

    A vertex mean, not an area-weighted centroid — matching the original
    implementation. The duplicated closing vertex is excluded so it does not
    get double-weighted.
    """
    vertices = _open_ring(ring)
    if not vertices:
        raise ValueError("Cannot compute the centroid of an empty ring.")
    mean_x = sum(p[0] for p in vertices) / len(vertices)
    mean_y = sum(p[1] for p in vertices) / len(vertices)
    return lambert_to_wgs84(mean_x, mean_y)


def distance_and_bearing(
    from_lat: float, from_lng: float, to_lat: float, to_lng: float
) -> tuple[float, float]:
    """Great-circle distance (m) and initial bearing (deg, 0-360) between WGS84 points."""
    phi1, phi2 = math.radians(from_lat), math.radians(to_lat)
    d_phi = math.radians(to_lat - from_lat)
    d_lambda = math.radians(to_lng - from_lng)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    distance_m = 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))

    y = math.sin(d_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lambda)
    bearing_deg = (math.degrees(math.atan2(y, x)) + 360) % 360

    return distance_m, bearing_deg


CONFORMITY_TOLERANCE_M = 0.1


def is_distance_conforme(ecart_m: float) -> bool:
    return abs(ecart_m) <= CONFORMITY_TOLERANCE_M
