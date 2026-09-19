import React, { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, Marker as MaplibreMarker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** Renders a lot's polygon + borne/reference-point markers from its GeoJSON FeatureCollection. */
export default function LotMap({ geojson }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MaplibreMap({ container: containerRef.current, style: STYLE, center: [-7.6, 33.57], zoom: 12 });
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.on("load", () => setReady(true));
    mapRef.current = map;
    return () => {
      setReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Drawing waits on the map's own "load" (tracked in `ready`) rather than isStyleLoaded(),
  // which stays false while tiles load and would leave the polygon undrawn.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !geojson) return;

    ["lot-polygon-fill", "lot-polygon-line"].forEach((id) => map.getLayer(id) && map.removeLayer(id));
    if (map.getSource("lot-polygon")) map.removeSource("lot-polygon");

    const polygon = geojson.features.find((f) => f.properties.kind === "polygon");
    if (polygon) {
      map.addSource("lot-polygon", { type: "geojson", data: polygon });
      map.addLayer({ id: "lot-polygon-fill", type: "fill", source: "lot-polygon", paint: { "fill-color": "#b3261e", "fill-opacity": 0.14 } });
      map.addLayer({ id: "lot-polygon-line", type: "line", source: "lot-polygon", paint: { "line-color": "#b3261e", "line-width": 2.5 } });

      const bounds = polygon.geometry.coordinates[0].reduce(
        (b, [lng, lat]) => [[Math.min(b[0][0], lng), Math.min(b[0][1], lat)], [Math.max(b[1][0], lng), Math.max(b[1][1], lat)]],
        [[Infinity, Infinity], [-Infinity, -Infinity]],
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 0 });
    }

    (map._lotMarkers || []).forEach((m) => m.remove());
    map._lotMarkers = geojson.features
      .filter((f) => f.properties.kind === "borne" || f.properties.kind === "reference-point")
      .map((f) => {
        const marker = new MaplibreMarker({ color: f.properties.kind === "borne" ? "#b3261e" : "#1f6f68", scale: 0.7 })
          .setLngLat(f.geometry.coordinates);
        marker.getElement().title = f.properties.name || f.properties.label || "";
        return marker.addTo(map);
      });
  }, [geojson, ready]);

  return <div ref={containerRef} className="cad-map" />;
}
