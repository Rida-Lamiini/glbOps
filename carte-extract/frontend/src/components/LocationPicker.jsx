import React, { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, Marker as MaplibreMarker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, Pencil, Check, X, Trash2 } from "lucide-react";
import { VECTOR_STYLE, RASTER_FALLBACK_STYLE } from "../utils/mapStyle";

const DRAW_SOURCE_ID = "gt-lp-draw";
const BOUNDARY_SOURCE_ID = "gt-lp-boundary";

export default function LocationPicker({ lat, lng, onPick, geocoding, boundary, onBoundaryChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const isDrawingRef = useRef(false);
  const drawPointsRef = useRef([]);
  const vertexMarkersRef = useRef([]);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawCount, setDrawCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map = null;

    // React StrictMode double-invokes this effect (mount -> cleanup -> mount) synchronously in dev.
    // Deferring the actual MapLibre instantiation past that lets the phantom first invocation get
    // cancelled before it ever creates a map, instead of two instances fighting over one container.
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const hasPoint = lat != null && lng != null;

      map = new MaplibreMap({
        container: containerRef.current,
        style: VECTOR_STYLE,
        center: hasPoint ? [lng, lat] : [-6.85, 34.0],
        zoom: hasPoint ? 12 : 6,
        attributionControl: { compact: true },
      });
      map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
      map.on("error", () => map.setStyle(RASTER_FALLBACK_STYLE));
      map.on("click", (e) => {
        if (isDrawingRef.current) return;
        onPick(e.lngLat.lat, e.lngLat.lng);
      });

      mapRef.current = map;
      setReady(true);

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);
      map._locpickerResizeObserver = resizeObserver;
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (map) {
        map._locpickerResizeObserver?.disconnect();
        map.remove();
      }
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat == null || lng == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = new MaplibreMarker({ draggable: true, color: "#A3271D" }).setLngLat([lng, lat]).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLngLat();
        onPick(p.lat, p.lng);
      });
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, ready]);

  // Render the already-saved boundary, if any
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onBoundaryChange) return;

    const setup = () => {
      const data = { type: "FeatureCollection", features: boundary ? [{ type: "Feature", geometry: boundary, properties: {} }] : [] };
      if (!map.getSource(BOUNDARY_SOURCE_ID)) {
        map.addSource(BOUNDARY_SOURCE_ID, { type: "geojson", data });
        map.addLayer({ id: "gt-lp-boundary-fill", type: "fill", source: BOUNDARY_SOURCE_ID, paint: { "fill-color": "#A3271D", "fill-opacity": 0.15 } });
        map.addLayer({ id: "gt-lp-boundary-line", type: "line", source: BOUNDARY_SOURCE_ID, paint: { "line-color": "#A3271D", "line-width": 2 } });
      } else {
        map.getSource(BOUNDARY_SOURCE_ID).setData(data);
      }
    };

    if (map.isStyleLoaded()) setup();
    else map.once("load", setup);
  }, [boundary, onBoundaryChange, ready]);

  // Draw-in-progress interaction
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onBoundaryChange) return;
    isDrawingRef.current = drawing;

    const ensureLayer = () => {
      if (map.getSource(DRAW_SOURCE_ID)) return;
      map.addSource(DRAW_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "gt-lp-draw-fill",
        type: "fill",
        source: DRAW_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#2F4858", "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "gt-lp-draw-line",
        type: "line",
        source: DRAW_SOURCE_ID,
        paint: { "line-color": "#2F4858", "line-width": 2, "line-dasharray": [2, 1] },
      });
      map.addLayer({
        id: "gt-lp-draw-points",
        type: "circle",
        source: DRAW_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#2F4858", "circle-radius": 4, "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff" },
      });
    };

    const renderPolygonPreview = () => {
      const pts = drawPointsRef.current;
      const features = [];
      if (pts.length >= 3) {
        features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] }, properties: {} });
      } else if (pts.length === 2) {
        features.push({ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} });
      }
      map.getSource(DRAW_SOURCE_ID)?.setData({ type: "FeatureCollection", features });
    };

    const rebuildVertexMarkers = () => {
      vertexMarkersRef.current.forEach((m) => m.remove());
      vertexMarkersRef.current = [];
      drawPointsRef.current.forEach((coord) => {
        const el = document.createElement("div");
        el.className = "gt-lp-vertex";
        const marker = new MaplibreMarker({ element: el, draggable: true, anchor: "center" }).setLngLat(coord).addTo(map);
        marker.on("drag", () => {
          const p = marker.getLngLat();
          const i = vertexMarkersRef.current.indexOf(marker);
          if (i !== -1) drawPointsRef.current[i] = [p.lng, p.lat];
          renderPolygonPreview();
        });
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          const i = vertexMarkersRef.current.indexOf(marker);
          if (i === -1) return;
          drawPointsRef.current.splice(i, 1);
          setDrawCount(drawPointsRef.current.length);
          rebuildVertexMarkers();
          renderPolygonPreview();
        });
        vertexMarkersRef.current.push(marker);
      });
    };

    const handleClick = (e) => {
      drawPointsRef.current = [...drawPointsRef.current, [e.lngLat.lng, e.lngLat.lat]];
      setDrawCount(drawPointsRef.current.length);
      rebuildVertexMarkers();
      renderPolygonPreview();
    };

    if (drawing) {
      ensureLayer();
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", handleClick);
      rebuildVertexMarkers();
      renderPolygonPreview();
    }

    return () => {
      map.off("click", handleClick);
      if (map.getCanvas() && !isDrawingRef.current) map.getCanvas().style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, onBoundaryChange]);

  const clearVertexMarkers = () => {
    vertexMarkersRef.current.forEach((m) => m.remove());
    vertexMarkersRef.current = [];
  };

  const clearDrawSource = () => {
    mapRef.current?.getSource(DRAW_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
  };

  const startDrawing = () => {
    drawPointsRef.current = boundary ? boundary.coordinates[0].slice(0, -1).map((c) => [c[0], c[1]]) : [];
    setDrawCount(drawPointsRef.current.length);
    clearDrawSource();
    setDrawing(true);
  };

  const cancelDrawing = () => {
    setDrawing(false);
    drawPointsRef.current = [];
    setDrawCount(0);
    clearDrawSource();
    clearVertexMarkers();
  };

  const finishDrawing = () => {
    const pts = drawPointsRef.current;
    if (pts.length < 3) return;
    onBoundaryChange({ type: "Polygon", coordinates: [[...pts, pts[0]]] });
    setDrawing(false);
    drawPointsRef.current = [];
    setDrawCount(0);
    clearDrawSource();
    clearVertexMarkers();
  };

  const clearBoundary = () => {
    onBoundaryChange(null);
  };

  return (
    <div className="gt-locpicker">
      <div ref={containerRef} className="gt-locpicker-map" />
      <div className="gt-locpicker-hint">
        {geocoding ? (
          <>
            <Loader2 size={11} className="gt-spin-icon" /> Recherche de l'adresse…
          </>
        ) : drawing ? (
          `${drawCount} point${drawCount > 1 ? "s" : ""} — cliquez pour ajouter, glissez pour déplacer, clic droit pour retirer`
        ) : (
          "Cliquez sur la carte pour positionner le projet"
        )}
      </div>
      {onBoundaryChange && (
        <div className="gt-locpicker-draw-toolbar">
          {!drawing ? (
            <>
              <button type="button" className="gt-locpicker-drawbtn" onClick={startDrawing}>
                <Pencil size={12} /> {boundary ? "Retracer la limite" : "Dessiner la limite du terrain"}
              </button>
              {boundary && (
                <button type="button" className="gt-locpicker-drawbtn" onClick={clearBoundary}>
                  <Trash2 size={12} /> Effacer
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="gt-locpicker-drawbtn primary" onClick={finishDrawing} disabled={drawCount < 3}>
                <Check size={12} /> Terminer ({drawCount})
              </button>
              <button type="button" className="gt-locpicker-drawbtn" onClick={cancelDrawing}>
                <X size={12} /> Annuler
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
