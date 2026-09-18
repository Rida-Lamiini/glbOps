import React, { useEffect, useRef, useState } from "react";
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

function pinSVG(color) {
  return `
    <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.7 23.3 0 15 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15" r="5.5" fill="#fff"/>
    </svg>
  `;
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
}

function formatArea(m2) {
  return m2 < 10000 ? `${Math.round(m2)} m²` : `${(m2 / 10000).toFixed(2)} ha`;
}

export default function MapView({ projects, getClient, onOpenProjet, onCreateProjetAt }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const measurePointsRef = useRef([]);
  const searchAbortRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const importMarkersRef = useRef([]);
  const fileInputRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [basemap, setBasemap] = useState("street");
  const [rasterFallback, setRasterFallback] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [activeStatuses, setActiveStatuses] = useState(() => new Set(Object.keys(STATUS_LABELS)));
  const [measureMode, setMeasureMode] = useState(null); // null | "distance" | "area"
  const [measureTotal, setMeasureTotal] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importedPoints, setImportedPoints] = useState([]);
  const [importError, setImportError] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [cadastreGeojson, setCadastreGeojson] = useState(null);
  const [showCadastreLots, setShowCadastreLots] = useState(true);

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

    const boundaryGeojson = {
      type: "FeatureCollection",
      features: visibleProjects
        .filter((pr) => pr.boundary)
        .map((pr) => ({
          type: "Feature",
          geometry: pr.boundary,
          properties: { color: STATUS_COLORS[projetStatus(pr)] },
        })),
    };

    const openPopupFor = (pr) => {
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
      `;
      const btn = document.createElement("button");
      btn.className = "gt-map-popup-btn";
      btn.textContent = "Voir le projet →";
      btn.onclick = () => onOpenProjet(pr.id);
      popupNode.appendChild(btn);
      return new MaplibrePopup({ offset: [0, -34], maxWidth: "260px" }).setDOMContent(popupNode);
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
        map.addSource(BOUNDARY_SOURCE_ID, { type: "geojson", data: boundaryGeojson });
        map.addLayer({
          id: "gt-boundary-fill",
          type: "fill",
          source: BOUNDARY_SOURCE_ID,
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: "gt-boundary-line",
          type: "line",
          source: BOUNDARY_SOURCE_ID,
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });
      } else {
        map.getSource(BOUNDARY_SOURCE_ID).setData(boundaryGeojson);
      }

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
  }, [projects, activeStatuses, style, attempt, loaded]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cadastreGeojson) return;

    const setup = () => {
      if (!map.getSource(CADASTRE_SOURCE_ID)) {
        map.addSource(CADASTRE_SOURCE_ID, { type: "geojson", data: cadastreGeojson });
        map.addLayer({
          id: "gt-cadastre-fill",
          type: "fill",
          source: CADASTRE_SOURCE_ID,
          paint: { "fill-color": "#8B5CF6", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "gt-cadastre-line",
          type: "line",
          source: CADASTRE_SOURCE_ID,
          paint: { "line-color": "#8B5CF6", "line-width": 1.5, "line-dasharray": [3, 2] },
        });
        map.on("click", "gt-cadastre-fill", (e) => {
          const props = e.features[0].properties;
          new MaplibrePopup({ closeButton: true })
            .setLngLat(e.lngLat)
            .setHTML(
              `<strong>${props.proprieteDite || "Lot cadastral"}</strong><br/>Titre foncier ${props.titreFoncier || "—"}`,
            )
            .addTo(map);
        });
        map.on("mouseenter", "gt-cadastre-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "gt-cadastre-fill", () => { map.getCanvas().style.cursor = ""; });
      } else {
        map.getSource(CADASTRE_SOURCE_ID).setData(cadastreGeojson);
      }
      const visibility = showCadastreLots ? "visible" : "none";
      map.setLayoutProperty("gt-cadastre-fill", "visibility", visibility);
      map.setLayoutProperty("gt-cadastre-line", "visibility", visibility);
    };

    if (loaded) setup();
    else map.once("load", setup);
  }, [cadastreGeojson, showCadastreLots, style, attempt, loaded]);

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
        doc.text("Globétudes — Carte des projets", 10, 12);
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

  return (
    <>
      <div className="gt-stats">
        <div className="gt-stat gt-card">
          <div className="gt-stat-label">Projets géolocalisés</div>
          <div className="gt-stat-num">{geolocated.length}</div>
        </div>
        <div className="gt-stat gt-card">
          <div className="gt-stat-label">En cours</div>
          <div className="gt-stat-num">{counts.encours}</div>
          <span className="gt-status-pill info"><span className="gt-status-pill-dot" />En cours</span>
        </div>
        <div className="gt-stat gt-card">
          <div className="gt-stat-label">Non-conformité</div>
          <div className="gt-stat-num">{counts.nonconforme}</div>
          <span className={`gt-status-pill ${counts.nonconforme > 0 ? "danger" : "neutral"}`}>
            <span className="gt-status-pill-dot" />{counts.nonconforme > 0 ? "À traiter" : "Aucune"}
          </span>
        </div>
        <div className="gt-stat gt-card">
          <div className="gt-stat-label">Livrés</div>
          <div className="gt-stat-num">{counts.livre}</div>
          <span className="gt-status-pill success"><span className="gt-status-pill-dot" />Conforme</span>
        </div>
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

        <div className="gt-map-toolbar">
          <button className="gt-map-toolbtn" onClick={cycleBasemap} title="Changer de fond de carte">
            {basemap === "street" && <><Satellite size={14} /> Satellite</>}
            {basemap === "satellite" && <><Mountain size={14} /> Topographie</>}
            {basemap === "topo" && <><MapIcon size={14} /> Plan</>}
          </button>
          <button className={`gt-map-toolbtn ${measureMode === "distance" ? "active" : ""}`} onClick={() => toggleMeasure("distance")} title="Mesurer une distance">
            <Ruler size={14} /> Distance
          </button>
          <button className={`gt-map-toolbtn ${measureMode === "area" ? "active" : ""}`} onClick={() => toggleMeasure("area")} title="Mesurer une surface">
            <Shapes size={14} /> Surface
          </button>
          <button className="gt-map-toolbtn" onClick={() => fileInputRef.current?.click()} title="Importer des points GPX ou CSV">
            <Upload size={14} /> Importer
          </button>
          <button
            className={`gt-map-toolbtn ${showCadastreLots ? "active" : ""}`}
            onClick={() => setShowCadastreLots((v) => !v)}
            title="Afficher/masquer les lots cadastraux enregistrés"
          >
            <FileScan size={14} /> Lots cadastraux
          </button>
          <button className="gt-map-toolbtn" onClick={exportPdf} disabled={exportingPdf} title="Exporter la carte en PDF">
            <Printer size={14} /> {exportingPdf ? "Export…" : "PDF"}
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
            placeholder="Rechercher une adresse..."
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value)}
          />
          {searchQuery && (
            <button className="gt-iconbtn" onClick={() => { setSearchQuery(""); setSearchResults([]); searchMarkerRef.current?.remove(); }}>
              <X size={13} />
            </button>
          )}
          {(searching || searchResults.length > 0) && (
            <div className="gt-map-search-results">
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

        <div className="gt-map-legend">
          <div className="gt-map-legend-title">Statut du projet</div>
          {Object.keys(STATUS_LABELS).map((k) => (
            <button
              key={k}
              className={`gt-map-legend-row ${activeStatuses.has(k) ? "" : "inactive"}`}
              onClick={() => toggleStatus(k)}
            >
              <span className="gt-map-legend-dot" style={{ background: STATUS_COLORS[k] }} />
              {STATUS_LABELS[k]}
            </button>
          ))}
        </div>
        {geolocated.length < projects.length && (
          <div className="gt-map-note">
            {projects.length - geolocated.length} projet{projects.length - geolocated.length > 1 ? "s" : ""} sans coordonnées, non affiché{projects.length - geolocated.length > 1 ? "s" : ""}.
          </div>
        )}
      </div>
    </>
  );
}
