import { useEffect } from "react";

const SOURCE = "gt-consult";
const COLORS = { danger: "#b3261e", info: "#2f6690", query: "#1d1b18", ref: "#7a5aa6", route: "#1f7a55" };

// Draws a consultation on the map: the search circle, the parcel/position consulted, the neighbouring projets
// (red when they overlap, blue otherwise), the imported reference parcels and the planned route.
// `data` is a GeoJSON FeatureCollection whose features carry `role`.
export default function ConsultLayers({ map, loaded, data, styleKey }) {
  useEffect(() => {
    if (!map || !loaded) return undefined;
    let cancelled = false;
    const setup = () => {
      if (cancelled) return;
      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, { type: "geojson", data });
        const role = (r) => ["==", ["get", "role"], r];
        const poly = ["==", ["geometry-type"], "Polygon"];
        map.addLayer({ id: "gt-consult-circle", type: "line", source: SOURCE, filter: role("circle"), paint: { "line-color": COLORS.query, "line-width": 1.4, "line-dasharray": [3, 3], "line-opacity": 0.7 } });
        map.addLayer({ id: "gt-consult-ref-fill", type: "fill", source: SOURCE, filter: ["all", role("ref"), poly], paint: { "fill-color": COLORS.ref, "fill-opacity": 0.12 } });
        map.addLayer({ id: "gt-consult-ref-line", type: "line", source: SOURCE, filter: role("ref"), paint: { "line-color": COLORS.ref, "line-width": 1.6, "line-dasharray": [2, 2] } });
        map.addLayer({ id: "gt-consult-nb-fill", type: "fill", source: SOURCE, filter: ["all", role("neighbour"), poly], paint: { "fill-color": ["case", ["get", "hot"], COLORS.danger, COLORS.info], "fill-opacity": 0.2 } });
        map.addLayer({ id: "gt-consult-nb-line", type: "line", source: SOURCE, filter: role("neighbour"), paint: { "line-color": ["case", ["get", "hot"], COLORS.danger, COLORS.info], "line-width": 2.4 } });
        map.addLayer({ id: "gt-consult-nb-pin", type: "circle", source: SOURCE, filter: ["all", role("neighbour"), ["==", ["geometry-type"], "Point"]], paint: { "circle-radius": 7, "circle-color": ["case", ["get", "hot"], COLORS.danger, COLORS.info], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        map.addLayer({ id: "gt-consult-query-fill", type: "fill", source: SOURCE, filter: ["all", role("query"), poly], paint: { "fill-color": COLORS.query, "fill-opacity": 0.14 } });
        map.addLayer({ id: "gt-consult-query-line", type: "line", source: SOURCE, filter: role("query"), paint: { "line-color": COLORS.query, "line-width": 3 } });
        map.addLayer({ id: "gt-consult-query-pin", type: "circle", source: SOURCE, filter: ["all", role("query"), ["==", ["geometry-type"], "Point"]], paint: { "circle-radius": 8, "circle-color": COLORS.query, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
        map.addLayer({ id: "gt-consult-route", type: "line", source: SOURCE, filter: role("route"), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLORS.route, "line-width": 4, "line-opacity": 0.85 } });
        map.addLayer({ id: "gt-consult-stop", type: "circle", source: SOURCE, filter: role("stop"), paint: { "circle-radius": 11, "circle-color": COLORS.route, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        map.addLayer({ id: "gt-consult-stop-n", type: "symbol", source: SOURCE, filter: role("stop"), layout: { "text-field": ["get", "n"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
      } else {
        map.getSource(SOURCE).setData(data);
      }
    };
    if (map.isStyleLoaded()) setup();
    else map.once("idle", setup);
    return () => { cancelled = true; };
  }, [map, loaded, data, styleKey]);
  return null;
}

export const emptyConsult = { type: "FeatureCollection", features: [] };

const feat = (geometry, properties) => ({ type: "Feature", geometry, properties });

// Features for one consultation result (`reference` parcels are included when present).
export function resultFeatures(result, { showRef = true } = {}) {
  if (!result) return [];
  const out = [feat(result.query.circle, { role: "circle" }), feat(result.query.geometry, { role: "query" })];
  result.neighbours.forEach((n) => {
    if (n.geometry) out.push(feat(n.geometry, { role: "neighbour", hot: n.relation === "chevauche" || n.relation === "dans", projetId: n.projet_id || "" }));
  });
  if (showRef) (result.reference || []).forEach((r) => out.push(feat(r.geometry, { role: "ref", name: r.name })));
  return out;
}

export function routeFeatures(start, route) {
  if (!route) return [];
  const coords = [[start.lng, start.lat], ...route.stops.map((s) => [s.lng, s.lat])];
  return [
    feat({ type: "LineString", coordinates: coords }, { role: "route" }),
    ...route.stops.map((s) => feat({ type: "Point", coordinates: [s.lng, s.lat] }, { role: "stop", n: String(s.order) })),
  ];
}
