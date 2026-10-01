import React, { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, NavigationControl, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { VECTOR_STYLE, SATELLITE_STYLE } from "../../utils/mapStyle";
import { bboxOfFeatureCollection, buildReferenceLines } from "./geo";

const BASEMAPS = [
  { key: "plan", label: "Plan", style: VECTOR_STYLE },
  { key: "satellite", label: "Satellite", style: SATELLITE_STYLE },
];

const LOT_COLOR = "#A3271D";
const REF_COLOR = "#1E2C3C";

function addLotLayers(map, geojson) {
  const refLines = buildReferenceLines(geojson);

  const lotSource = map.getSource("ocr-lot-data");
  if (lotSource) lotSource.setData(geojson);
  else map.addSource("ocr-lot-data", { type: "geojson", data: geojson });

  const refSource = map.getSource("ocr-ref-lines");
  if (refSource) refSource.setData(refLines);
  else map.addSource("ocr-ref-lines", { type: "geojson", data: refLines });

  if (!map.getLayer("ocr-lot-fill")) {
    map.addLayer({
      id: "ocr-lot-fill",
      type: "fill",
      source: "ocr-lot-data",
      filter: ["==", ["get", "kind"], "polygon"],
      paint: { "fill-color": LOT_COLOR, "fill-opacity": 0.15 },
    });
  }
  if (!map.getLayer("ocr-lot-outline")) {
    map.addLayer({
      id: "ocr-lot-outline",
      type: "line",
      source: "ocr-lot-data",
      filter: ["==", ["get", "kind"], "polygon"],
      paint: { "line-color": LOT_COLOR, "line-width": 2 },
    });
  }
  if (!map.getLayer("ocr-ref-line")) {
    map.addLayer({
      id: "ocr-ref-line",
      type: "line",
      source: "ocr-ref-lines",
      paint: { "line-color": REF_COLOR, "line-width": 1.5, "line-dasharray": [2, 2] },
    });
  }
  if (!map.getLayer("ocr-ref-point")) {
    map.addLayer({
      id: "ocr-ref-point",
      type: "circle",
      source: "ocr-lot-data",
      filter: ["==", ["get", "kind"], "reference-point"],
      paint: { "circle-radius": 5, "circle-color": REF_COLOR },
    });
  }
  if (!map.getLayer("ocr-borne-point")) {
    map.addLayer({
      id: "ocr-borne-point",
      type: "circle",
      source: "ocr-lot-data",
      filter: ["==", ["get", "kind"], "borne"],
      paint: {
        "circle-radius": 5,
        "circle-color": LOT_COLOR,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

export default function LotMap({ geojson }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geojsonRef = useRef(geojson);
  const [basemap, setBasemap] = useState("plan");

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: VECTOR_STYLE,
      center: [-7.5, 33.5],
      zoom: 14,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      addLotLayers(map, geojsonRef.current);
      const bbox = bboxOfFeatureCollection(geojsonRef.current);
      if (bbox) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 48, maxZoom: 18, duration: 0 },
        );
      }
    });

    const popupFor = (layerId, render) => {
      map.on("click", layerId, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        new Popup()
          .setLngLat(feature.geometry.coordinates)
          .setHTML(render(feature.properties))
          .addTo(map);
      });
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    };

    popupFor(
      "ocr-borne-point",
      (p) =>
        `<div class="gt-map-popup"><strong>${p.name}</strong><br/>X : ${Number(p.xLambert).toFixed(3)}<br/>Y : ${Number(p.yLambert).toFixed(3)}<br/>Lat : ${Number(p.lat).toFixed(6)}<br/>Lng : ${Number(p.lng).toFixed(6)}</div>`,
    );
    popupFor(
      "ocr-ref-point",
      (p) =>
        `<div class="gt-map-popup"><strong>${p.label}</strong><br/>Distance : ${Number(p.distanceM).toFixed(1)} m<br/>Azimut : ${Number(p.bearingDeg).toFixed(1)}°</div>`,
    );

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push data updates into the existing map instead of rebuilding it. The ref
  // keeps the load/styledata handlers above reading the current data without
  // making the map's own effect depend on (and tear the map down for) every new
  // object identity the parent hands us.
  useEffect(() => {
    geojsonRef.current = geojson;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    addLotLayers(map, geojson);
  }, [geojson]);

  const isFirstBasemapRender = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // The map is already constructed with this basemap on mount — skipping the
    // redundant setStyle() avoids interrupting the in-flight initial tile load.
    if (isFirstBasemapRender.current) {
      isFirstBasemapRender.current = false;
      return;
    }
    const next = BASEMAPS.find((b) => b.key === basemap);
    if (!next) return;
    map.setStyle(next.style);
    map.once("styledata", () => addLotLayers(map, geojsonRef.current));
  }, [basemap]);

  return (
    <div className="gt-ocr-map">
      <div ref={containerRef} className="gt-ocr-map-canvas" />
      <div className="gt-ocr-map-switch">
        {BASEMAPS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={basemap === b.key ? "active" : ""}
            onClick={() => setBasemap(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
