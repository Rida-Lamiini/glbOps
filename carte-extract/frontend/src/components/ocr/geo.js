/**
 * Client-side geometry for the OCR review screen.
 *
 * The backend recomputes all of this authoritatively on save (see
 * backend/cadastre/geo/), but the review form needs the same numbers live,
 * while the user is still correcting values and nothing has been submitted —
 * so the two implementations are deliberately kept in step. Everything here is
 * plain planar math on the Lambert grid, which is how the ANCFCC document
 * itself computes area from bornes.
 */

const closeRing = (ring) => {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.x === last.x && first.y === last.y) return ring;
  return [...ring, first];
};

/** Planar shoelace area (m²) of a Lambert-plane ring, in borne sequence order. */
export function planarShoelaceAreaM2(ring) {
  const closed = closeRing(ring);
  let twiceArea = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    twiceArea += closed[i].x * closed[i + 1].y - closed[i + 1].x * closed[i].y;
  }
  return Math.abs(twiceArea) / 2;
}

/** Sum of consecutive borne-to-borne distances, closing the loop back to the first borne. */
export function planarPerimeterM(ring) {
  const closed = closeRing(ring);
  let total = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    total += Math.hypot(closed[i + 1].x - closed[i].x, closed[i + 1].y - closed[i].y);
  }
  return total;
}

/**
 * Per-vertex partial derivative of the shoelace area with respect to that
 * vertex's own X and Y (∂Area/∂x_i = (y_{i+1}−y_{i−1})/2, ∂Area/∂y_i =
 * (x_{i−1}−x_{i+1})/2 — standard shoelace derivatives). This is what an area
 * cross-check tolerance is implicitly relying on: a vertex whose two neighbours
 * are close together in Y has a near-zero dAreaPerDx, so an X error there can be
 * arbitrarily large and still hide under the tolerance (mirrored for dAreaPerDy
 * and close-together neighbour X). Used to surface those blind spots for the
 * lot actually on screen.
 */
export function shoelaceAreaSensitivity(ring) {
  const n = ring.length;
  if (n < 3) return [];
  return ring.map((_, i) => {
    const prev = ring[(i - 1 + n) % n];
    const next = ring[(i + 1) % n];
    return {
      index: i,
      dAreaPerDx: (next.y - prev.y) / 2,
      dAreaPerDy: (prev.x - next.x) / 2,
    };
  });
}

// Mirrors SURFACE_CONFORMITY_TOLERANCE_M2 in backend/cadastre/geo/build_lot.py.
// See that file for why 1 m² is not a geometry-independent guarantee.
export const SURFACE_CONFORMITY_TOLERANCE_M2 = 1.0;

export const CONFORMITY_TOLERANCE_M = 0.1;

export const isDistanceConforme = (ecartM) => Math.abs(ecartM) <= CONFORMITY_TOLERANCE_M;

export const isSurfaceConforme = (surfaceCalculeeM2, correctionLambertM2, surfaceDocumentM2) =>
  Math.abs(surfaceCalculeeM2 + correctionLambertM2 - surfaceDocumentM2) <=
  SURFACE_CONFORMITY_TOLERANCE_M2;

export const fmt = (n, digits = 2) =>
  Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Bounding box [minLng, minLat, maxLng, maxLat] of a GeoJSON FeatureCollection. */
export function bboxOfFeatureCollection(fc) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (coords) => {
    if (typeof coords[0] === "number") {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else {
      coords.forEach(visit);
    }
  };

  for (const feature of fc?.features || []) {
    if (!feature.geometry || !("coordinates" in feature.geometry)) continue;
    visit(feature.geometry.coordinates);
  }

  if (minX === Infinity) return null;
  return [minX, minY, maxX, maxY];
}

/** Dashed-line FeatureCollection from each reference point back to the lot centroid. */
export function buildReferenceLines(fc) {
  const features = [];
  for (const feature of fc?.features || []) {
    if (feature.properties?.kind !== "reference-point") continue;
    if (feature.geometry?.type !== "Point") continue;
    const { centroidLat, centroidLng } = feature.properties;
    if (centroidLat == null || centroidLng == null) continue;
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [[centroidLng, centroidLat], feature.geometry.coordinates],
      },
      properties: feature.properties,
    });
  }
  return { type: "FeatureCollection", features };
}
