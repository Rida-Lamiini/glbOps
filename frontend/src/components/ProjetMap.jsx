import React, { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, Marker as MaplibreMarker, NavigationControl, ScaleControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPinOff } from "lucide-react";
import { VECTOR_STYLE, RASTER_FALLBACK_STYLE, SATELLITE_STYLE } from "../utils/mapStyle";

const BOUNDARY_SOURCE_ID = "gt-fiche-boundary";
const MARKER_COLOR = "#A3271D";
const BOUNDARY_COLOR = "#315efb";

const BASEMAPS = [
  { key: "plan", label: "Plan", style: VECTOR_STYLE },
  { key: "satellite", label: "Satellite", style: SATELLITE_STYLE },
];

// Walks a GeoJSON coordinate tree of any depth down to its [lng, lat] leaves.
function collectCoords(coordinates, out = []) {
  if (!Array.isArray(coordinates)) return out;
  if (typeof coordinates[0] === "number") out.push(coordinates);
  else coordinates.forEach((c) => collectCoords(c, out));
  return out;
}

function boundsOf(geometry) {
  const coords = collectCoords(geometry?.coordinates);
  if (coords.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

/**
 * Read-only counterpart to LocationPicker: shows where a projet sits and, when one has been
 * drawn, the parcel outline around it. No click-to-pick — editing goes through LocationPicker.
 */
export default function ProjetMap({ lat, lng, boundary }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [basemap, setBasemap] = useState("plan");
  // The map is built inside a rAF, so the marker/boundary effects below would otherwise run
  // (and bail out on a null mapRef) before it exists. Flipping this re-runs them once it does.
  const [ready, setReady] = useState(false);

  const hasPoint = lat != null && lng != null;

  useEffect(() => {
    if (!containerRef.current || !hasPoint) return;
    let cancelled = false;
    let map = null;

    // Same StrictMode guard as LocationPicker: defer instantiation past the phantom first
    // invocation so the dev-mode double-effect can't leave two maps fighting over one container.
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;

      map = new MaplibreMap({
        container: containerRef.current,
        style: VECTOR_STYLE,
        center: [lng, lat],
        zoom: 15,
        attributionControl: { compact: true },
      });
      map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
      map.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");
      map.on("error", () => map.setStyle(RASTER_FALLBACK_STYLE));

      mapRef.current = map;
      setReady(true);

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);
      map._ficheResizeObserver = resizeObserver;
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (map) {
        map._ficheResizeObserver?.disconnect();
        map.remove();
      }
      mapRef.current = null;
      markerRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPoint]);

  // Marker follows the projet's coordinates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasPoint) return;
    if (!markerRef.current) {
      markerRef.current = new MaplibreMarker({ color: MARKER_COLOR }).setLngLat([lng, lat]).addTo(map);
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    map.easeTo({ center: [lng, lat], duration: 400 });
  }, [lat, lng, hasPoint, ready]);

  // The boundary layers live on the style, so they have to be re-added after every basemap
  // switch — `styledata` fires once the new style is in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const data = {
      type: "FeatureCollection",
      features: boundary ? [{ type: "Feature", geometry: boundary, properties: {} }] : [],
    };

    const paint = () => {
      if (!map.getSource(BOUNDARY_SOURCE_ID)) {
        map.addSource(BOUNDARY_SOURCE_ID, { type: "geojson", data });
        map.addLayer({
          id: "gt-fiche-boundary-fill",
          type: "fill",
          source: BOUNDARY_SOURCE_ID,
          paint: { "fill-color": BOUNDARY_COLOR, "fill-opacity": 0.18 },
        });
        map.addLayer({
          id: "gt-fiche-boundary-line",
          type: "line",
          source: BOUNDARY_SOURCE_ID,
          paint: { "line-color": BOUNDARY_COLOR, "line-width": 2.5 },
        });
      } else {
        map.getSource(BOUNDARY_SOURCE_ID).setData(data);
      }

      const bounds = boundsOf(boundary);
      if (bounds) map.fitBounds(bounds, { padding: 56, maxZoom: 18, duration: 500 });
    };

    if (map.isStyleLoaded()) paint();
    map.on("styledata", paint);
    return () => { map.off("styledata", paint); };
  }, [boundary, basemap, hasPoint, ready]);

  const switchBasemap = (key) => {
    setBasemap(key);
    const option = BASEMAPS.find((b) => b.key === key);
    if (option) mapRef.current?.setStyle(option.style);
  };

  if (!hasPoint) {
    return (
      <div className="gt-fiche-map gt-fiche-map-empty">
        <MapPinOff size={22} />
        <div>Coordonnées GPS non renseignées</div>
        <div className="gt-fiche-map-empty-sub">Renseignez-les via « Modifier » pour localiser ce projet.</div>
      </div>
    );
  }

  return (
    <div className="gt-fiche-map">
      <div ref={containerRef} className="gt-fiche-map-canvas" />
      <div className="gt-fiche-map-switch">
        {BASEMAPS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={basemap === b.key ? "is-active" : undefined}
            onClick={() => switchBasemap(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
