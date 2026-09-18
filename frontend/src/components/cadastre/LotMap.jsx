import React, { useEffect, useRef } from "react";
import { Map as MaplibreMap, Marker as MaplibreMarker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** Renders a lot's polygon + borne/reference-point markers from its GeoJSON FeatureCollection. */
export default function LotMap({ geojson }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MaplibreMap({ container: containerRef.current, style: STYLE, center: [-7.6, 33.57], zoom: 12 });
    map.addControl(new NavigationControl(), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const draw = () => {
      if (map.getLayer("lot-polygon-fill")) map.removeLayer("lot-polygon-fill");
      if (map.getLayer("lot-polygon-line")) map.removeLayer("lot-polygon-line");
      if (map.getSource("lot-polygon")) map.removeSource("lot-polygon");

      const polygon = geojson.features.find((f) => f.properties.kind === "polygon");
      if (polygon) {
        map.addSource("lot-polygon", { type: "geojson", data: polygon });
        map.addLayer({ id: "lot-polygon-fill", type: "fill", source: "lot-polygon", paint: { "fill-color": "#4f7cff", "fill-opacity": 0.15 } });
        map.addLayer({ id: "lot-polygon-line", type: "line", source: "lot-polygon", paint: { "line-color": "#4f7cff", "line-width": 2 } });

        const coords = polygon.geometry.coordinates[0];
        const bounds = coords.reduce(
          (b, [lng, lat]) => [[Math.min(b[0][0], lng), Math.min(b[0][1], lat)], [Math.max(b[1][0], lng), Math.max(b[1][1], lat)]],
          [[Infinity, Infinity], [-Infinity, -Infinity]],
        );
        map.fitBounds(bounds, { padding: 40, maxZoom: 18, duration: 0 });
      }

      (map._lotMarkers || []).forEach((m) => m.remove());
      map._lotMarkers = geojson.features
        .filter((f) => f.properties.kind === "borne" || f.properties.kind === "reference-point")
        .map((f) => {
          const color = f.properties.kind === "borne" ? "#4f7cff" : "#e0a527";
          const marker = new MaplibreMarker({ color }).setLngLat(f.geometry.coordinates);
          marker.getElement().title = f.properties.name || f.properties.label || "";
          marker.addTo(map);
          return marker;
        });
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [geojson]);

  return <div ref={containerRef} style={{ width: "100%", height: 320, borderRadius: 8, overflow: "hidden" }} />;
}
