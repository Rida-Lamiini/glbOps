import React, { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { VECTOR_STYLE, SATELLITE_STYLE } from "../../utils/mapStyle";
import { getAllCadastreLotsGeoJSON, readApiError } from "./api";
import { bboxOfFeatureCollection } from "./geo";

const BASEMAPS = [
  { key: "plan", label: "Plan", style: VECTOR_STYLE },
  { key: "satellite", label: "Satellite", style: SATELLITE_STYLE },
];

const LOT_COLOR = "#A3271D";

function addOverviewLayers(map, geojson) {
  const source = map.getSource("ocr-all-lots");
  if (source) source.setData(geojson);
  else map.addSource("ocr-all-lots", { type: "geojson", data: geojson });

  if (!map.getLayer("ocr-all-lots-fill")) {
    map.addLayer({
      id: "ocr-all-lots-fill",
      type: "fill",
      source: "ocr-all-lots",
      paint: { "fill-color": LOT_COLOR, "fill-opacity": 0.18 },
    });
  }
  if (!map.getLayer("ocr-all-lots-outline")) {
    map.addLayer({
      id: "ocr-all-lots-outline",
      type: "line",
      source: "ocr-all-lots",
      paint: { "line-color": LOT_COLOR, "line-width": 2 },
    });
  }
}

export default function OverviewMap({ onOpenLot }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geojsonRef = useRef(null);
  const onOpenLotRef = useRef(onOpenLot);
  const [geojson, setGeojson] = useState(null);
  const [error, setError] = useState(null);
  const [basemap, setBasemap] = useState("plan");

  useEffect(() => {
    onOpenLotRef.current = onOpenLot;
  }, [onOpenLot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fc = await getAllCadastreLotsGeoJSON();
        if (!cancelled) setGeojson(fc);
      } catch (err) {
        if (!cancelled) setError(readApiError(err, "Impossible de charger la carte des lots."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The container is always mounted (see below), so the map is built once and
  // data arriving later flows in through the effect after this one.
  useEffect(() => {
    if (!containerRef.current) return undefined;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: VECTOR_STYLE,
      center: [-7.5, 33.5],
      zoom: 11,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (!geojsonRef.current) return;
      addOverviewLayers(map, geojsonRef.current);
      const bbox = bboxOfFeatureCollection(geojsonRef.current);
      if (bbox) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 48, maxZoom: 17, duration: 0 },
        );
      }
    });

    map.on("click", "ocr-all-lots-fill", (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onOpenLotRef.current?.(id);
    });
    map.on("mouseenter", "ocr-all-lots-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "ocr-all-lots-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Feeds the fetched lots into the already-built map, and fits the view to
  // them the first time they arrive.
  useEffect(() => {
    geojsonRef.current = geojson;
    const map = mapRef.current;
    if (!map || !geojson || !map.isStyleLoaded()) return;
    addOverviewLayers(map, geojson);
    const bbox = bboxOfFeatureCollection(geojson);
    if (bbox) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 48, maxZoom: 17, duration: 0 },
      );
    }
  }, [geojson]);

  const isFirstBasemapRender = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isFirstBasemapRender.current) {
      isFirstBasemapRender.current = false;
      return;
    }
    const next = BASEMAPS.find((b) => b.key === basemap);
    if (!next) return;
    map.setStyle(next.style);
    map.once("styledata", () => addOverviewLayers(map, geojsonRef.current));
  }, [basemap]);

  const lotCount = geojson?.features?.length ?? 0;

  return (
    <div className="gt-ocr">
      <div className="gt-ocr-head">
        <div>
          <h2 className="gt-ocr-title">Carte des lots</h2>
          <p className="gt-ocr-sub">
            {error
              ? "—"
              : `${lotCount} lot${lotCount > 1 ? "s" : ""} — cliquez sur un polygone pour ouvrir sa fiche.`}
          </p>
        </div>
      </div>

      {error && <p className="gt-ocr-warn">{error}</p>}
      {!error && !geojson && <p className="gt-ocr-sub">Chargement…</p>}
      {!error && geojson && lotCount === 0 && (
        <p className="gt-ocr-sub" style={{ margin: 0 }}>
          Aucun lot géométré pour l'instant — la carte se remplira au fur et à mesure des imports.
        </p>
      )}

      <div className="gt-ocr-map" style={error ? { display: "none" } : undefined}>
        <div ref={containerRef} className="gt-ocr-map-canvas" style={{ height: "68vh" }} />
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
    </div>
  );
}
