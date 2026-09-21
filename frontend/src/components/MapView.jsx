import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MaplibreMap,
  Marker as MaplibreMarker,
  Popup as MaplibrePopup,
  NavigationControl,
  ScaleControl,
  GeolocateControl,
  FullscreenControl,
  LngLatBounds,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import distance from "@turf/distance";
import area from "@turf/area";
import { jsPDF } from "jspdf";
import {
  AlertTriangle,
  RotateCcw,
  Satellite,
  Map as MapIcon,
  Mountain,
  Search,
  Ruler,
  Shapes,
  X,
  Upload,
  Printer,
  FileScan,
  List as ListIcon,
  ChevronDown,
  Crosshair,
} from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS, STATUS_PILL_KIND } from "../constants";
import { projetStatus } from "../utils/stats";
import { VECTOR_STYLE, RASTER_FALLBACK_STYLE, SATELLITE_STYLE, TOPO_STYLE } from "../utils/mapStyle";
import { forwardGeocode } from "../utils/geocode";
import { formatLambert } from "../utils/lambert";
import { parseImportFile } from "../utils/importPoints";
import { getAllCadastreLotsGeoJSON } from "./cadastre/api";

const LOAD_TIMEOUT_MS = 8000;
const SOURCE_ID = "gt-projects";
const BOUNDARY_SOURCE_ID = "gt-boundaries";
const MEASURE_SOURCE_ID = "gt-measure";
const CADASTRE_SOURCE_ID = "gt-cadastre-lots";
const LOT_COLORS = { valide: "#1f7a55", verifie: "#2f6690", brouillon: "#b7791f" };
const LOT_STATUT_LABEL = { valide: "Validé", verifie: "Vérifié", brouillon: "Brouillon" };
const LOT_LABEL_ZOOM = 13;

// First ring of a (Multi)Polygon: its centre (average of the vertices) and bounding box.
function lotShape(geometry) {
  const ring = geometry?.type === "MultiPolygon" ? geometry.coordinates?.[0]?.[0] : geometry?.coordinates?.[0];
  if (!ring || ring.length === 0) return null;
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring; // the last vertex repeats the first
  return {
    center: [pts.reduce((a, c) => a + c[0], 0) / pts.length, pts.reduce((a, c) => a + c[1], 0) / pts.length],
    bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
  };
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const fmtM2 = (n) => `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²`;

function pinSVG(color) {
  return `
    <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.7 23.3 0 15 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15" r="5.5" fill="#fff"/>
    </svg>
  `;
}


// No surveyed geometry yet for most projets: draw an approximate, irregular parcel around the
// projet's location so it can be seen and clicked. Deterministic per projet id (stable shape
// between renders) and flagged `approximate` so it can be told apart from a real boundary.
function approximateBoundary(pr) {
  let h = 2166136261;
  for (const ch of String(pr.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9;
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const baseM = 70 + rand() * 60;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((pr.lat * Math.PI) / 180);
  const n = 9;
  const ring = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI + (rand() - 0.5) * 0.35;
    const r = baseM * (0.7 + rand() * 0.6);
    ring.push([pr.lng + (Math.cos(angle) * r) / mPerDegLng, pr.lat + (Math.sin(angle) * r) / mPerDegLat]);
  }
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
}

function formatArea(m2) {
  return m2 < 10000 ? `${Math.round(m2)} m²` : `${(m2 / 10000).toFixed(2)} ha`;
}

export default function MapView({ projects, getClient, onOpenProjet, onCreateProjetAt, onOpenLot, focusLotId, onFocusHandled }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const boundaryPopupRef = useRef(null);
  const measureModeRef = useRef(null);
  const boundaryClickRef = useRef(null);
  const measurePointsRef = useRef([]);
  const searchAbortRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const importMarkersRef = useRef([]);
  const lotMarkersRef = useRef([]);
  const lotPopupRef = useRef(null);
  const focusedLotRef = useRef(null);
  const lotsRef = useRef([]);
  const fileInputRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [basemap, setBasemap] = useState("street");
  const [rasterFallback, setRasterFallback] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [activeStatuses, setActiveStatuses] = useState(() => new Set(Object.keys(STATUS_LABELS)));
  const [measureMode, setMeasureMode] = useState(null); // null | "distance" | "area"

  measureModeRef.current = measureMode;
  const [measureTotal, setMeasureTotal] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importedPoints, setImportedPoints] = useState([]);
  const [importError, setImportError] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [cadastreGeojson, setCadastreGeojson] = useState(null);
  const [showCadastreLots, setShowCadastreLots] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState("projets");
  const [legendOpen, setLegendOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth > 700));
  const [activeId, setActiveId] = useState(null);

  const geolocated = projects.filter((p) => p.lat != null && p.lng != null);
  const visibleProjects = geolocated.filter((pr) => activeStatuses.has(projetStatus(pr)));

  const counts = { vide: 0, encours: 0, nonconforme: 0, livre: 0 };
  geolocated.forEach((pr) => { counts[projetStatus(pr)] += 1; });

  const style =
    basemap === "satellite" ? SATELLITE_STYLE :
    basemap === "topo" ? TOPO_STYLE :
    rasterFallback ? RASTER_FALLBACK_STYLE : VECTOR_STYLE;

  useEffect(() => {
    if (!containerRef.current) return;

    setLoaded(false);
    setMapError(null);

    // React StrictMode double-invokes this effect (mount -> cleanup -> mount) synchronously in
    // dev. Deferring the actual MapLibre instantiation past that lets the phantom first
    // invocation get cancelled before it ever creates a map, instead of two instances fighting
    // over one container (which otherwise leaves the map permanently blank).
    let cancelled = false;
    let map = null;
    let timeoutId = null;

    const raf = requestAnimationFrame(() => {
      if (cancelled) return;

      map = new MaplibreMap({
        container: containerRef.current,
        style,
        center: [-6.85, 34.0],
        zoom: 7,
        attributionControl: { compact: true },
      });
      map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
      map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "top-right");
      map.addControl(new FullscreenControl(), "top-right");
      map.addControl(new ScaleControl({ maxWidth: 100, unit: "metric" }), "top-left");

      const handleLoad = () => setLoaded(true);
      const handleError = (e) => {
        console.error("MapLibre error:", e?.error || e);
        if (basemap === "street" && !rasterFallback) {
          // Basemap style/tiles failed (network block, ad-blocker, unreachable host) — fall back to plain raster tiles.
          setRasterFallback(true);
        } else {
          setMapError("Impossible de charger le fond de carte. Vérifiez votre connexion internet.");
        }
      };

      map.on("load", handleLoad);
      map.on("error", handleError);
      mapRef.current = map;

      timeoutId = setTimeout(() => {
        if (!map._removed && !map.isStyleLoaded()) {
          handleError(new Error("timeout"));
        }
      }, LOAD_TIMEOUT_MS);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (timeoutId) clearTimeout(timeoutId);
      if (map) map.remove();
      mapRef.current = null;
      markersRef.current = {};
      searchMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, attempt]);

  // Projects, clusters, and saved boundaries
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const geojson = {
      type: "FeatureCollection",
      features: visibleProjects.map((pr) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [pr.lng, pr.lat] },
        properties: { projetId: pr.id },
      })),
    };

    // Real geometry wins over the indicative outline: a drawn boundary first, then a saved
    // cadastral lot of that projet, and only then the approximation around the pin.
    const lotGeometry = {};
    (cadastreGeojson?.features || []).forEach((f) => {
      const pid = f.properties?.projetId;
      if (pid && !lotGeometry[pid]) lotGeometry[pid] = f.geometry;
    });
    const exactGeometry = (pr) => pr.boundary || lotGeometry[pr.id] || null;
    const boundaryGeojson = {
      type: "FeatureCollection",
      features: visibleProjects.map((pr) => ({
        type: "Feature",
        geometry: exactGeometry(pr) || approximateBoundary(pr),
        properties: { projetId: pr.id, color: STATUS_COLORS[projetStatus(pr)], approximate: !exactGeometry(pr) },
      })),
    };

    const openPopupFor = (pr, offset = [0, -34]) => {
      const client = getClient(pr.clientId);
      const status = projetStatus(pr);
      const kind = STATUS_PILL_KIND[status];
      const popupNode = document.createElement("div");
      popupNode.className = "gt-map-popup";
      popupNode.innerHTML = `
        <div class="gt-map-popup-top">
          <span class="gt-map-popup-id">${pr.id}</span>
          <span class="gt-map-popup-badge" style="color:var(--status-${kind});background:var(--status-${kind}-bg)">${STATUS_LABELS[status]}</span>
        </div>
        <div class="gt-map-popup-client">${client?.nom || "—"}</div>
        <div class="gt-map-popup-meta">${pr.situation}</div>
        <div class="gt-map-popup-meta">${pr.naturePrestationProjet || "—"} · Réf. ${pr.referenceFonciere || "—"}</div>
        <div class="gt-map-popup-meta">${pr.prestations.length} prestation${pr.prestations.length > 1 ? "s" : ""}</div>
        <div class="gt-map-popup-meta gt-mono">Lambert : ${formatLambert(pr.lat, pr.lng)}</div>
        ${exactGeometry(pr) ? "" : '<div class="gt-map-popup-meta"><em>Emprise indicative — géométrie exacte non renseignée</em></div>'}
      `;
      const btn = document.createElement("button");
      btn.className = "gt-map-popup-btn";
      btn.textContent = "Voir le projet →";
      btn.onclick = () => onOpenProjet(pr.id);
      popupNode.appendChild(btn);
      return new MaplibrePopup({ offset, maxWidth: "260px" }).setDOMContent(popupNode);
    };

    const syncMarkers = () => {
      if (!map.getSource(SOURCE_ID)) return;
      let features;
      try {
        features = map.querySourceFeatures(SOURCE_ID, { filter: ["!", ["has", "point_count"]] });
      } catch {
        return;
      }
      const visibleIds = new Set(features.map((f) => f.properties.projetId));

      Object.keys(markersRef.current).forEach((id) => {
        if (!visibleIds.has(id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });

      visibleIds.forEach((id) => {
        if (markersRef.current[id]) return;
        const pr = visibleProjects.find((p) => p.id === id);
        if (!pr) return;
        const status = projetStatus(pr);
        const el = document.createElement("div");
        el.className = "gt-map-marker";
        el.innerHTML = pinSVG(STATUS_COLORS[status]);
        el.title = `${pr.id} — ${getClient(pr.clientId)?.nom || "—"}`;

        const marker = new MaplibreMarker({ element: el, anchor: "bottom" })
          .setLngLat([pr.lng, pr.lat])
          .setPopup(openPopupFor(pr))
          .addTo(map);
        markersRef.current[id] = marker;
      });
    };

    const setupLayers = () => {
      if (!map.getSource(BOUNDARY_SOURCE_ID)) {
        map.addSource(BOUNDARY_SOURCE_ID, { type: "geojson", data: boundaryGeojson, promoteId: "projetId" });
        map.addLayer({
          id: "gt-boundary-fill",
          type: "fill",
          source: BOUNDARY_SOURCE_ID,
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.4, 0.18],
          },
        });
        // line-dasharray can't be data-driven, so approximate (dashed) and surveyed (solid) outlines are two layers.
        map.addLayer({
          id: "gt-boundary-line",
          type: "line",
          source: BOUNDARY_SOURCE_ID,
          filter: ["!=", ["get", "approximate"], true],
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });
        map.addLayer({
          id: "gt-boundary-line-approx",
          type: "line",
          source: BOUNDARY_SOURCE_ID,
          filter: ["==", ["get", "approximate"], true],
          paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [2, 1.5] },
        });

        let hoveredId = null;
        const setHover = (id, hover) => id != null && map.setFeatureState({ source: BOUNDARY_SOURCE_ID, id }, { hover });
        map.on("mousemove", "gt-boundary-fill", (e) => {
          const id = e.features[0]?.properties.projetId;
          if (id === hoveredId) return;
          setHover(hoveredId, false);
          hoveredId = id;
          setHover(hoveredId, true);
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "gt-boundary-fill", () => {
          setHover(hoveredId, false);
          hoveredId = null;
          map.getCanvas().style.cursor = "";
        });
      } else {
        map.getSource(BOUNDARY_SOURCE_ID).setData(boundaryGeojson);
      }

      // Re-bound on every run so the handler always sees the current projects (no stale closure).
      if (boundaryClickRef.current) map.off("click", "gt-boundary-fill", boundaryClickRef.current);
      boundaryClickRef.current = (e) => {
        if (measureModeRef.current) return;
        const id = e.features[0]?.properties.projetId;
        const pr = visibleProjects.find((p) => p.id === id);
        if (!pr) return;
        boundaryPopupRef.current?.remove();
        boundaryPopupRef.current = openPopupFor(pr, [0, 0]).setLngLat(e.lngLat).addTo(map);
      };
      map.on("click", "gt-boundary-fill", boundaryClickRef.current);

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
        map.addLayer({
          id: "gt-clusters",
          type: "circle",
          source: SOURCE_ID,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#14181F",
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "gt-cluster-count",
          type: "symbol",
          source: SOURCE_ID,
          filter: ["has", "point_count"],
          layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Noto Sans Bold"], "text-size": 12 },
          paint: { "text-color": "#ffffff" },
        });

        map.on("click", "gt-clusters", (e) => {
          const [feature] = map.queryRenderedFeatures(e.point, { layers: ["gt-clusters"] });
          const clusterId = feature.properties.cluster_id;
          map.getSource(SOURCE_ID).getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 400 });
          }).catch(() => {});
        });
        map.on("mouseenter", "gt-clusters", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "gt-clusters", () => { map.getCanvas().style.cursor = ""; });

        map.on("data", (e) => { if (e.sourceId === SOURCE_ID && e.isSourceLoaded) syncMarkers(); });
        map.on("moveend", syncMarkers);
      } else {
        map.getSource(SOURCE_ID).setData(geojson);
      }

      syncMarkers();

      const bounds = new LngLatBounds();
      visibleProjects.forEach((pr) => bounds.extend([pr.lng, pr.lat]));
      if (visibleProjects.length === 1) {
        map.easeTo({ center: [visibleProjects[0].lng, visibleProjects[0].lat], zoom: 11, duration: 500 });
      } else if (visibleProjects.length > 1) {
        map.fitBounds(bounds, { padding: { top: 50, bottom: 150, left: 50, right: 50 }, maxZoom: 12, duration: 500 });
      }
    };

    // `loaded` flips true on the map's "load" event, after which addSource/addLayer are safe.
    // isStyleLoaded() is stricter (false while any source/tiles are still loading) and, since
    // "load" has already fired by then, a once("load") fallback would never run — layers and
    // markers would silently never be set up.
    if (loaded) setupLayers();
    else map.once("load", setupLayers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, activeStatuses, style, attempt, loaded, cadastreGeojson]);

  // Distance / area measurement tool
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ensureMeasureLayers = () => {
      if (map.getSource(MEASURE_SOURCE_ID)) return;
      map.addSource(MEASURE_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "gt-measure-fill",
        type: "fill",
        source: MEASURE_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#A3271D", "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "gt-measure-line",
        type: "line",
        source: MEASURE_SOURCE_ID,
        paint: { "line-color": "#A3271D", "line-width": 2, "line-dasharray": [2, 1] },
      });
      map.addLayer({
        id: "gt-measure-points",
        type: "circle",
        source: MEASURE_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#A3271D", "circle-radius": 4, "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff" },
      });
    };

    const renderMeasure = () => {
      const pts = measurePointsRef.current;
      const features = pts.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: {} }));
      if (pts.length >= 2) {
        if (measureMode === "area" && pts.length >= 3) {
          features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] }, properties: {} });
        } else {
          features.push({ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} });
        }
      }
      map.getSource(MEASURE_SOURCE_ID)?.setData({ type: "FeatureCollection", features });

      if (measureMode === "distance" && pts.length >= 2) {
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
          total += distance(pts[i - 1], pts[i], { units: "kilometers" });
        }
        setMeasureTotal(formatDistance(total));
      } else if (measureMode === "area" && pts.length >= 3) {
        const m2 = area({ type: "Polygon", coordinates: [[...pts, pts[0]]] });
        setMeasureTotal(formatArea(m2));
      } else {
        setMeasureTotal(null);
      }
    };

    const handleClick = (e) => {
      measurePointsRef.current = [...measurePointsRef.current, [e.lngLat.lng, e.lngLat.lat]];
      renderMeasure();
    };

    if (measureMode) {
      ensureMeasureLayers();
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", handleClick);
    }

    return () => {
      map.off("click", handleClick);
      if (map.getCanvas()) map.getCanvas().style.cursor = "";
    };
  }, [measureMode]);

  // Saved cadastral lot polygons — past surveys are useful context when
  // siting a new project nearby, so they're shown by default (toggleable).
  useEffect(() => {
    getAllCadastreLotsGeoJSON().then(setCadastreGeojson).catch(() => {});
  }, []);

  // One entry per lot: what the pins, the search and the list need (centre, bounds, status…).
  const lots = useMemo(
    () =>
      (cadastreGeojson?.features || [])
        .map((f) => {
          const shape = lotShape(f.geometry);
          const p = f.properties || {};
          if (!shape) return null;
          return {
            id: p.id,
            titre: p.titreFoncier || "—",
            propriete: p.proprieteDite || "Lot cadastral",
            projetId: p.projetId || "",
            statut: p.statut || "brouillon",
            conforme: p.conforme !== false,
            surfaceCalculee: p.surfaceCalculeeM2,
            surfaceDocument: p.surfaceDocumentM2,
            ...shape,
          };
        })
        .filter(Boolean),
    [cadastreGeojson],
  );
  lotsRef.current = lots;

  const applyLotFocus = (map) => {
    if (!map.getLayer("gt-cadastre-focus")) return;
    map.setFilter("gt-cadastre-focus", ["==", ["get", "id"], focusedLotRef.current || ""]);
  };

  // Popup card for a lot, with links to the lot sheet and its projet.
  const openLotPopup = (lot, lngLat) => {
    const map = mapRef.current;
    if (!map || !lot) return;
    lotPopupRef.current?.remove();
    const box = el("div", "gt-lot-popup");
    box.appendChild(el("div", "gt-lot-popup-eyebrow", `Lot cadastral · Titre ${lot.titre}`));
    box.appendChild(el("strong", "gt-lot-popup-title", lot.propriete));
    const badges = el("div", "gt-lot-popup-badges");
    badges.appendChild(el("span", `gt-lot-chip is-${lot.statut}`, LOT_STATUT_LABEL[lot.statut] || lot.statut));
    badges.appendChild(el("span", `gt-lot-chip ${lot.conforme ? "is-ok" : "is-bad"}`, lot.conforme ? "Surface conforme" : "Écart de surface"));
    box.appendChild(badges);
    if (lot.surfaceCalculee != null) {
      box.appendChild(el("div", "gt-lot-popup-meta", `Calculée ${fmtM2(lot.surfaceCalculee)} · document ${fmtM2(lot.surfaceDocument)}`));
    }
    const actions = el("div", "gt-lot-popup-actions");
    if (onOpenLot) {
      const b = el("button", "gt-lot-popup-btn is-primary", "Ouvrir le lot");
      b.onclick = () => onOpenLot(lot.id);
      actions.appendChild(b);
    }
    if (lot.projetId && onOpenProjet) {
      const b = el("button", "gt-lot-popup-btn", `Projet ${lot.projetId}`);
      b.onclick = () => onOpenProjet(lot.projetId);
      actions.appendChild(b);
    }
    if (actions.childNodes.length) box.appendChild(actions);
    lotPopupRef.current = new MaplibrePopup({ closeButton: true, maxWidth: "300px", offset: 8 })
      .setLngLat(lngLat || lot.center)
      .setDOMContent(box)
      .addTo(map);
  };

  // Zoom on a lot, outline it strongly and open its card.
  const focusLot = (lot) => {
    const map = mapRef.current;
    if (!map || !lot) return;
    setShowCadastreLots(true);
    focusedLotRef.current = lot.id;
    applyLotFocus(map);
    map.fitBounds(lot.bounds, { padding: { top: 90, bottom: 170, left: 70, right: 70 }, maxZoom: 18, duration: 800 });
    map.once("moveend", () => openLotPopup(lot, lot.center));
  };

  // Click on a lot polygon: outline it and open its card where the click happened.
  const openLotFromMap = (id, lngLat) => {
    const lot = lotsRef.current.find((l) => l.id === id);
    if (!lot || !mapRef.current) return;
    focusedLotRef.current = lot.id;
    applyLotFocus(mapRef.current);
    openLotPopup(lot, lngLat);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cadastreGeojson) return;

    const setup = () => {
      const colorByStatut = ["match", ["get", "statut"], "valide", LOT_COLORS.valide, "verifie", LOT_COLORS.verifie, LOT_COLORS.brouillon];
      if (!map.getSource(CADASTRE_SOURCE_ID)) {
        map.addSource(CADASTRE_SOURCE_ID, { type: "geojson", data: cadastreGeojson });
        // white halo so the outline reads on satellite and on busy street maps alike
        map.addLayer({ id: "gt-cadastre-halo", type: "line", source: CADASTRE_SOURCE_ID, paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.85 } });
        map.addLayer({ id: "gt-cadastre-fill", type: "fill", source: CADASTRE_SOURCE_ID, paint: { "fill-color": colorByStatut, "fill-opacity": 0.32 } });
        map.addLayer({ id: "gt-cadastre-line", type: "line", source: CADASTRE_SOURCE_ID, paint: { "line-color": colorByStatut, "line-width": 2.6 } });
        // surface gap: dashed red outline on top
        map.addLayer({ id: "gt-cadastre-ecart", type: "line", source: CADASTRE_SOURCE_ID, filter: ["==", ["get", "conforme"], false], paint: { "line-color": "#b3261e", "line-width": 2.6, "line-dasharray": [2, 1.5] } });
        map.addLayer({ id: "gt-cadastre-focus", type: "line", source: CADASTRE_SOURCE_ID, filter: ["==", ["get", "id"], ""], paint: { "line-color": "#1d1b18", "line-width": 5 } });
        map.on("click", "gt-cadastre-fill", (e) => {
          if (measureModeRef.current) return;
          openLotFromMap(e.features[0].properties.id, e.lngLat);
        });
        map.on("mouseenter", "gt-cadastre-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "gt-cadastre-fill", () => { map.getCanvas().style.cursor = ""; });
      } else {
        map.getSource(CADASTRE_SOURCE_ID).setData(cadastreGeojson);
      }
      const visibility = showCadastreLots ? "visible" : "none";
      ["gt-cadastre-halo", "gt-cadastre-fill", "gt-cadastre-line", "gt-cadastre-ecart", "gt-cadastre-focus"].forEach((id) => map.setLayoutProperty(id, "visibility", visibility));
      applyLotFocus(map);
    };

    if (loaded) setup();
    else map.once("load", setup);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadastreGeojson, showCadastreLots, style, attempt, loaded]);

  // Pins at each lot's centre: a lot of 100 m is invisible at city zoom, so the pin is what you spot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !showCadastreLots) return undefined;
    const pins = lots.map((lot) => {
      const pin = el("button", `gt-lot-pin is-${lot.statut}${lot.conforme ? "" : " is-gap"}`);
      pin.type = "button";
      pin.title = `${lot.propriete} — Titre ${lot.titre}`;
      pin.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>';
      pin.appendChild(el("span", "gt-lot-pin-label", lot.titre));
      pin.onclick = (e) => { e.stopPropagation(); focusLot(lot); };
      return new MaplibreMarker({ element: pin, anchor: "center" }).setLngLat(lot.center).addTo(map);
    });
    lotMarkersRef.current = pins;
    const container = map.getContainer();
    const sync = () => container.classList.toggle("gt-lots-labeled", map.getZoom() >= LOT_LABEL_ZOOM);
    sync();
    map.on("zoom", sync);
    return () => {
      map.off("zoom", sync);
      pins.forEach((m) => m.remove());
      lotMarkersRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, showCadastreLots, loaded]);

  // Arriving from a lot sheet ("Voir sur la carte"): zoom on that lot once it is loaded.
  useEffect(() => {
    if (!focusLotId || !loaded || lots.length === 0) return;
    const lot = lots.find((l) => l.id === focusLotId);
    if (lot) focusLot(lot);
    onFocusHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLotId, loaded, lots]);

  // Imported GPX/CSV points
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    importMarkersRef.current.forEach((m) => m.remove());
    importMarkersRef.current = [];

    importedPoints.forEach((pt) => {
      const el = document.createElement("div");
      el.className = "gt-map-marker";
      el.innerHTML = pinSVG("#2F4858");
      el.title = pt.name;

      const popupNode = document.createElement("div");
      popupNode.className = "gt-map-popup";
      popupNode.innerHTML = `
        <div class="gt-map-popup-client">${pt.name}</div>
        <div class="gt-map-popup-meta gt-mono">${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}</div>
        <div class="gt-map-popup-meta gt-mono">Lambert : ${formatLambert(pt.lat, pt.lng)}</div>
      `;
      const btn = document.createElement("button");
      btn.className = "gt-map-popup-btn";
      btn.textContent = "Créer un projet ici →";
      btn.onclick = () => onCreateProjetAt?.(pt.lat, pt.lng, pt.name);
      popupNode.appendChild(btn);

      const marker = new MaplibreMarker({ element: el, anchor: "bottom" })
        .setLngLat([pt.lng, pt.lat])
        .setPopup(new MaplibrePopup({ offset: [0, -34], maxWidth: "240px" }).setDOMContent(popupNode))
        .addTo(map);
      importMarkersRef.current.push(marker);
    });

    if (importedPoints.length > 0) {
      const bounds = new LngLatBounds();
      importedPoints.forEach((pt) => bounds.extend([pt.lng, pt.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 500 });
    }
  }, [importedPoints, loaded, onCreateProjetAt]);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const points = parseImportFile(file.name, text);
      if (points.length === 0) {
        setImportError("Aucun point trouvé dans ce fichier.");
        return;
      }
      setImportedPoints(points);
    } catch {
      setImportError("Impossible de lire ce fichier (GPX ou CSV attendu).");
    }
  };

  const clearImported = () => {
    setImportedPoints([]);
    setImportError(null);
  };

  const exportPdf = () => {
    const map = mapRef.current;
    if (!map) return;
    setExportingPdf(true);
    map.once("idle", () => {
      try {
        const canvas = map.getCanvas();
        const imgData = canvas.toDataURL("image/png");
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        doc.setFontSize(14);
        doc.text("Globetudes — Carte des projets", 10, 12);
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(new Date().toLocaleDateString("fr-FR"), pageW - 10, 12, { align: "right" });

        const imgW = pageW - 20;
        const imgH = (canvas.height / canvas.width) * imgW;
        const maxH = pageH - 30;
        const finalH = Math.min(imgH, maxH);
        const finalW = (canvas.width / canvas.height) * finalH;
        doc.addImage(imgData, "PNG", 10, 18, finalW, finalH);

        let legendY = 18;
        Object.keys(STATUS_LABELS).forEach((k) => {
          doc.setFillColor(STATUS_COLORS[k]);
          doc.circle(finalW + 18, legendY + 3, 1.5, "F");
          doc.setFontSize(8);
          doc.setTextColor(40);
          doc.text(STATUS_LABELS[k], finalW + 22, legendY + 4);
          legendY += 6;
        });

        doc.save(`globetudes-carte-${new Date().toISOString().slice(0, 10)}.pdf`);
      } finally {
        setExportingPdf(false);
      }
    });
  };

  const retry = () => {
    setRasterFallback(false);
    setAttempt((a) => a + 1);
  };

  const BASEMAP_ORDER = ["street", "satellite", "topo"];
  const cycleBasemap = () => {
    setRasterFallback(false);
    setBasemap((b) => BASEMAP_ORDER[(BASEMAP_ORDER.indexOf(b) + 1) % BASEMAP_ORDER.length]);
  };

  const toggleStatus = (key) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size === 0 ? new Set(Object.keys(STATUS_LABELS)) : next;
    });
  };

  const clearMeasure = () => {
    measurePointsRef.current = [];
    setMeasureTotal(null);
    mapRef.current?.getSource(MEASURE_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
  };

  const toggleMeasure = (mode) => {
    setMeasureMode((current) => {
      const next = current === mode ? null : mode;
      measurePointsRef.current = [];
      setMeasureTotal(null);
      mapRef.current?.getSource(MEASURE_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
      return next;
    });
  };

  const runSearch = (q) => {
    setSearchQuery(q);
    searchAbortRef.current?.abort();
    if (!q.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    forwardGeocode(q, controller.signal)
      .then((results) => setSearchResults(results))
      .catch(() => {})
      .finally(() => setSearching(false));
  };

  const lotMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return lots.filter((l) => l.titre.toLowerCase().includes(q) || l.propriete.toLowerCase().includes(q) || l.projetId.toLowerCase().includes(q)).slice(0, 5);
  }, [lots, searchQuery]);

  const selectSearchResult = (r) => {
    const map = mapRef.current;
    setSearchResults([]);
    setSearchQuery(r.label);
    if (!map) return;
    map.flyTo({ center: [r.lng, r.lat], zoom: 15, duration: 700 });
    searchMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.className = "gt-map-marker";
    el.innerHTML = pinSVG("#2F4858");
    searchMarkerRef.current = new MaplibreMarker({ element: el, anchor: "bottom" }).setLngLat([r.lng, r.lat]).addTo(map);
  };

  // Recentre on a projet from the list, then open its popup once the marker has been (re)built.
  const focusProject = (pr) => {
    const map = mapRef.current;
    if (!map) return;
    setActiveId(pr.id);
    map.flyTo({ center: [pr.lng, pr.lat], zoom: Math.max(map.getZoom(), 15), duration: 900 });
    // Markers are (re)built asynchronously after the move (cluster -> individual pin), so wait for it.
    map.once("moveend", () => {
      let tries = 0;
      const open = () => {
        const marker = markersRef.current[pr.id];
        if (marker) {
          if (!marker.getPopup().isOpen()) marker.togglePopup();
        } else if (tries++ < 15) {
          setTimeout(open, 150);
        }
      };
      open();
    });
  };

  return (
    <>
      <div className="gt-map-kpis" role="list">
        <div className="gt-map-kpi" role="listitem"><b>{geolocated.length}</b><span>projets géolocalisés</span></div>
        <div className="gt-map-kpi" role="listitem"><i style={{ background: STATUS_COLORS.encours }} /><b>{counts.encours}</b><span>en cours</span></div>
        <div className="gt-map-kpi" role="listitem"><i style={{ background: STATUS_COLORS.nonconforme }} /><b>{counts.nonconforme}</b><span>non-conformité{counts.nonconforme > 0 ? " · à traiter" : ""}</span></div>
        <div className="gt-map-kpi" role="listitem"><i style={{ background: STATUS_COLORS.livre }} /><b>{counts.livre}</b><span>livrés</span></div>
      </div>
      <div className="gt-map-wrap">
        <div ref={containerRef} className="gt-map" />
        {!loaded && !mapError && (
          <div className="gt-map-loading">
            <span className="gt-map-spinner" /> Chargement de la carte…
          </div>
        )}
        {mapError && (
          <div className="gt-map-loading gt-map-error">
            <AlertTriangle size={16} />
            <div>{mapError}</div>
            <button className="gt-btn gt-btn-neutral" onClick={retry}>
              <RotateCcw size={14} /> Réessayer
            </button>
          </div>
        )}

        <div className="gt-map-toolbar" role="toolbar" aria-label="Outils de la carte">
          <button className="gt-map-toolbtn" onClick={cycleBasemap} title="Changer de fond de carte" aria-label="Changer de fond de carte">
            {basemap === "street" && <><Satellite size={14} /> <span className="lbl">Satellite</span></>}
            {basemap === "satellite" && <><Mountain size={14} /> <span className="lbl">Topographie</span></>}
            {basemap === "topo" && <><MapIcon size={14} /> <span className="lbl">Plan</span></>}
          </button>
          <span className="gt-map-toolsep" />
          <button className={`gt-map-toolbtn ${measureMode === "distance" ? "active" : ""}`} onClick={() => toggleMeasure("distance")} title="Mesurer une distance" aria-label="Mesurer une distance">
            <Ruler size={14} /> <span className="lbl">Distance</span>
          </button>
          <button className={`gt-map-toolbtn ${measureMode === "area" ? "active" : ""}`} onClick={() => toggleMeasure("area")} title="Mesurer une surface" aria-label="Mesurer une surface">
            <Shapes size={14} /> <span className="lbl">Surface</span>
          </button>
          <span className="gt-map-toolsep" />
          <button className="gt-map-toolbtn" onClick={() => fileInputRef.current?.click()} title="Importer des points GPX ou CSV" aria-label="Importer des points GPX ou CSV">
            <Upload size={14} /> <span className="lbl">Importer</span>
          </button>
          <button
            className={`gt-map-toolbtn ${showCadastreLots ? "active" : ""}`}
            onClick={() => setShowCadastreLots((v) => !v)}
            title="Afficher/masquer les lots cadastraux enregistrés" aria-label="Afficher/masquer les lots cadastraux enregistrés"
          >
            <FileScan size={14} /> <span className="lbl">Lots cadastraux{lots.length ? ` (${lots.length})` : ""}</span>
          </button>
          <button
            className={`gt-map-toolbtn ${panelOpen ? "active" : ""}`}
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            title="Liste des projets affichés" aria-label="Liste des projets affichés"
          >
            <ListIcon size={14} /> <span className="lbl">Projets ({visibleProjects.length})</span>
          </button>
          <span className="gt-map-toolsep" />
          <button className="gt-map-toolbtn" onClick={exportPdf} disabled={exportingPdf} title="Exporter la carte en PDF" aria-label="Exporter la carte en PDF">
            <Printer size={14} /> <span className="lbl">{exportingPdf ? "Export…" : "PDF"}</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".gpx,.csv,text/csv,application/gpx+xml" style={{ display: "none" }} onChange={handleImportFile} />
        </div>

        {(importedPoints.length > 0 || importError) && (
          <div className="gt-map-measure-badge" style={{ top: 50 }}>
            {importError || `${importedPoints.length} point${importedPoints.length > 1 ? "s" : ""} importé${importedPoints.length > 1 ? "s" : ""}`}
            <button className="gt-iconbtn" onClick={clearImported} title="Effacer">
              <X size={13} />
            </button>
          </div>
        )}

        <div className="gt-map-search">
          <Search size={13} color="#9A9C92" />
          <input
            placeholder="Adresse, titre foncier ou lot…"
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value)}
          />
          {searchQuery && (
            <button className="gt-iconbtn" onClick={() => { setSearchQuery(""); setSearchResults([]); searchMarkerRef.current?.remove(); }}>
              <X size={13} />
            </button>
          )}
          {(searching || searchResults.length > 0 || lotMatches.length > 0) && (
            <div className="gt-map-search-results">
              {lotMatches.length > 0 && <div className="gt-map-search-group">Lots cadastraux</div>}
              {lotMatches.map((l) => (
                <button key={l.id} className="gt-map-search-item gt-map-search-lot" onClick={() => { setSearchQuery(""); setSearchResults([]); focusLot(l); }}>
                  <span className="gt-lot-dot" style={{ background: LOT_COLORS[l.statut] }} />
                  <span><b>Titre {l.titre}</b> · {l.propriete}</span>
                </button>
              ))}
              {lotMatches.length > 0 && (searching || searchResults.length > 0) && <div className="gt-map-search-group">Adresses</div>}
              {searching && <div className="gt-map-search-item gt-map-search-loading">Recherche…</div>}
              {!searching && searchResults.map((r, i) => (
                <button key={i} className="gt-map-search-item" onClick={() => selectSearchResult(r)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {measureMode && (
          <div className="gt-map-measure-badge">
            {measureTotal || (measureMode === "distance" ? "Cliquez pour placer des points" : "Cliquez pour tracer la surface")}
            <button className="gt-iconbtn" onClick={clearMeasure} title="Effacer">
              <X size={13} />
            </button>
          </div>
        )}

        <div className={`gt-map-legend ${legendOpen ? "" : "is-collapsed"}`}>
          <button type="button" className="gt-map-legend-title" onClick={() => setLegendOpen((v) => !v)} aria-expanded={legendOpen}>
            Statut du projet <ChevronDown size={12} className="gt-map-legend-chev" />
          </button>
          {legendOpen && Object.keys(STATUS_LABELS).map((k) => (
            <button
              key={k}
              className={`gt-map-legend-row ${activeStatuses.has(k) ? "" : "inactive"}`}
              onClick={() => toggleStatus(k)}
            >
              <span className="gt-map-legend-dot" style={{ background: STATUS_COLORS[k] }} />
              {STATUS_LABELS[k]} <span className="gt-map-legend-n">{counts[k]}</span>
            </button>
          ))}
          {legendOpen && showCadastreLots && lots.length > 0 && (
            <div className="gt-map-legend-section" aria-label="Légende des lots cadastraux">
              <div className="gt-map-legend-subtitle">Lots cadastraux</div>
              {Object.keys(LOT_COLORS).map((k) => (
                <div key={k} className="gt-map-legend-row" style={{ cursor: "default" }}>
                  <span className="gt-lot-swatch" style={{ background: LOT_COLORS[k] }} />
                  {LOT_STATUT_LABEL[k]} <span className="gt-map-legend-n">{lots.filter((l) => l.statut === k).length}</span>
                </div>
              ))}
              <div className="gt-map-legend-row" style={{ cursor: "default" }}>
                <span className="gt-lot-swatch is-gap" />
                Écart de surface <span className="gt-map-legend-n">{lots.filter((l) => !l.conforme).length}</span>
              </div>
            </div>
          )}
        </div>

        {panelOpen && (
          <aside className="gt-map-panel" aria-label="Projets affichés sur la carte">
            <div className="gt-map-panel-head">
              <div className="gt-map-panel-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={panelTab === "projets"} className={panelTab === "projets" ? "is-on" : ""} onClick={() => setPanelTab("projets")}>Projets ({visibleProjects.length})</button>
                <button type="button" role="tab" aria-selected={panelTab === "lots"} className={panelTab === "lots" ? "is-on" : ""} onClick={() => setPanelTab("lots")}>Lots ({lots.length})</button>
              </div>
              <button className="gt-iconbtn" onClick={() => setPanelOpen(false)} aria-label="Fermer la liste"><X size={15} /></button>
            </div>
            <div className="gt-map-panel-list">
              {panelTab === "lots" && lots.map((l) => (
                <button key={l.id} type="button" className="gt-map-panel-item" onClick={() => focusLot(l)}>
                  <span className="gt-lot-dot" style={{ background: LOT_COLORS[l.statut] }} />
                  <span className="gt-map-panel-item-body">
                    <span className="gt-map-panel-item-title">{l.propriete}</span>
                    <span className="gt-map-panel-item-meta">Titre {l.titre} · {LOT_STATUT_LABEL[l.statut]}{l.conforme ? "" : " · écart de surface"}</span>
                  </span>
                  <Crosshair size={14} className="gt-map-panel-item-go" />
                </button>
              ))}
              {panelTab === "lots" && lots.length === 0 && <div className="gt-list-empty">Aucun lot enregistré.</div>}
              {panelTab === "projets" && visibleProjects.map((pr) => {
                const st = projetStatus(pr);
                return (
                  <button key={pr.id} type="button" className={`gt-map-panel-item ${activeId === pr.id ? "is-active" : ""}`} onClick={() => focusProject(pr)}>
                    <span className="gt-map-legend-dot" style={{ background: STATUS_COLORS[st] }} />
                    <span className="gt-map-panel-item-body">
                      <span className="gt-map-panel-item-title">{getClient(pr.clientId)?.nom || "—"}</span>
                      <span className="gt-map-panel-item-meta">{pr.id} · {pr.situation}</span>
                    </span>
                    <Crosshair size={14} className="gt-map-panel-item-go" />
                  </button>
                );
              })}
              {panelTab === "projets" && visibleProjects.length === 0 && <div className="gt-list-empty">Aucun projet avec ce filtre de statut.</div>}
            </div>
          </aside>
        )}
        {geolocated.length < projects.length && (
          <div className="gt-map-note">
            {projects.length - geolocated.length} projet{projects.length - geolocated.length > 1 ? "s" : ""} sans coordonnées, non affiché{projects.length - geolocated.length > 1 ? "s" : ""}.
          </div>
        )}
      </div>
    </>
  );
}
