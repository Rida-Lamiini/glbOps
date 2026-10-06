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
  Landmark,
  ScanSearch,
} from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS, STATUS_PILL_KIND } from "../constants";
import { projetStatus } from "../utils/stats";
import { NATURES, NATURE_ORDER, natureKind, projetNatures, prestationKind } from "../utils/nature";
import { esc, prestationRowHTML, LOT_COLORS, LOT_STATUT_LABEL } from "../utils/mapCards";
import MapRibbon from "./map/MapRibbon";
import MapPanel from "./map/MapPanel";
import ConsultPanel from "./consult/ConsultPanel";
import ConsultLayers from "./consult/ConsultLayers";
import "../styles/consult.css";
import "../styles/carte-atlas.css";
import { VECTOR_STYLE, RASTER_FALLBACK_STYLE, SATELLITE_STYLE, TOPO_STYLE } from "../utils/mapStyle";
import { forwardGeocode } from "../utils/geocode";
import { formatLambert } from "../utils/lambert";
import { parseImportFile, parseKML } from "../utils/importPoints";
import { getAllCadastreLotsGeoJSON } from "./cadastre/api";

const LOAD_TIMEOUT_MS = 8000;
const SOURCE_ID = "gt-projects";
const BOUNDARY_SOURCE_ID = "gt-boundaries";
const MEASURE_SOURCE_ID = "gt-measure";
const IMPORT_SHAPES_ID = "gt-import-shapes";
const CADASTRE_SOURCE_ID = "gt-cadastre-lots";
const COMMUNES_SOURCE_ID = "gt-communes";
const COMMUNE_TYPE_LABEL = { urban: "Commune urbaine", rural: "Commune rurale", arrondissement: "Arrondissement" };
// Administrative divisions, from coarse to fine: 12 régions (Fès-Meknès…), 75 provinces/préfectures, 1,502 communes
// (HCP codes, OSM geometry). Each file is fetched the first time its level is shown; régions is the default.
const ADMIN_LEVELS = [
  {
    key: "region", next: { key: "province", label: "Provinces" }, label: "Régions", count: "12", url: "/data/regions.json", labelZoom: 0, maxLabels: 20,
    // dash-dot, heavy: the convention for a région boundary on a printed map
    line: { color: "#3b2a20", width: [4, 1.4, 12, 3], dash: [6, 2, 1, 2] },
    eyebrow: () => "Région",
    stats: (p) => [[p.n, "provinces"], [p.communes, "communes"]],
    lines: () => [],
  },
  {
    key: "province", next: { key: "commune", label: "Communes" }, label: "Provinces", count: "75", url: "/data/provinces.json", labelZoom: 6.5, maxLabels: 40,
    line: { color: "#7a4a2a", width: [5, 0.9, 12, 2.2], dash: [4, 2] },
    eyebrow: () => "Province · Préfecture",
    stats: (p) => [[p.n, "communes"]],
    lines: (p) => [p.region],
  },
  {
    key: "commune", label: "Communes", count: "1 502", url: "/data/communes.json", labelZoom: 10, maxLabels: 80,
    line: { color: "#8a6f4d", width: [6, 0.6, 13, 1.6], dash: [1.2, 1.6] },
    eyebrow: (p) => COMMUNE_TYPE_LABEL[p.type] || "Commune",
    stats: () => [],
    lines: (p) => [p.province && `Province ${p.province}`, p.region].filter(Boolean),
  },
];

const LOT_LABEL_ZOOM = 13;
// Plan côté lots get a dimension-line glyph in a round pill; other lots keep the document glyph in a squared tag.
const LOT_GLYPH_PLAN = '<svg width="15" height="13" viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18"/><path d="M3 4v12M21 4v12"/><path d="M7 6.5 3 10l4 3.5M17 6.5l4 3.5-4 3.5"/></svg>';
const LOT_GLYPH_OTHER = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>';

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

// Plan côté: classic teardrop with a dimension line (the "côtes"). Every other nature: a squared
// tag-pin with its own glyph — same status colour, different silhouette.
const PIN_GLYPH = {
  plan: '<g stroke="#14181F" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M8.5 15h13"/><path d="M8.5 11.5v7M21.5 11.5v7"/><path d="M11.5 12.8 8.5 15l3 2.2M18.5 12.8l3 2.2-3 2.2" stroke-width="1.3"/></g>',
  bornage: '<rect x="11" y="9.5" width="8" height="8" transform="rotate(45 15 13.5)" fill="#14181F"/>',
  lidar: '<g fill="none" stroke="#14181F" stroke-width="1.6" stroke-linecap="round"><circle cx="15" cy="13" r="1.6" fill="#14181F" stroke="none"/><path d="M10.5 17a6.4 6.4 0 0 1 0-8.8M19.5 17a6.4 6.4 0 0 0 0-8.8"/></g>',
  autre: '<circle cx="15" cy="13" r="3.4" fill="#14181F"/>',
  mec: '<g fill="#14181F"><rect x="9.5" y="8" width="11" height="2.4" rx="1.2"/><rect x="9.5" y="12" width="11" height="2.4" rx="1.2"/><rect x="9.5" y="16" width="7" height="2.4" rx="1.2"/></g>',
  copro: '<g fill="#14181F"><rect x="9" y="8" width="7" height="7" rx="1.2"/><rect x="14" y="12.5" width="7" height="7" rx="1.2" opacity=".55"/></g>',
  mt: '<g stroke="#14181F" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 10.5h10M17 8l2.5 2.5L17 13"/><path d="M20.5 15.5h-10M13 13l-2.5 2.5L13 18"/></g>',
};

// A small dark disc with the number of prestations when a projet has more than one.
const pinCount = (n) =>
  n > 1 ? `<circle cx="24.5" cy="5.5" r="6" fill="#1d1b18" stroke="#fff" stroke-width="1.6"/><text x="24.5" y="8.6" text-anchor="middle" font-family="Hanken Grotesk, sans-serif" font-size="8.5" font-weight="700" fill="#fff">${n}</text>` : "";

function pinSVG(color, kind = "autre", count = 1) {
  if (kind === "plan") {
    return `
    <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.7 23.3 0 15 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15" r="9" fill="#fff"/>
      <g transform="translate(0 2)">${PIN_GLYPH.plan}</g>
      ${pinCount(count)}
    </svg>`;
  }
  return `
    <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 1h16a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5h-4.6L15 37l-3.4-12H7a5 5 0 0 1-5-5V6a5 5 0 0 1 5-5z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <rect x="7.5" y="5.5" width="15" height="15" rx="3.5" fill="#fff"/>
      ${PIN_GLYPH[kind] || PIN_GLYPH.autre}
      ${pinCount(count)}
    </svg>`;
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

// Cadastral lots are business-sensitive (titres fonciers, surfaces) — only office roles and
// the contrôle agent who signs off on them need to see the layer on the map. Agent Bureau
// already has its own dedicated Cadastre tool for that data; it just doesn't belong on their map.
const CADASTRE_MAP_ROLES = new Set(["Dispatcher", "Directrice", "Agent Contrôle"]);

export default function MapView({ projects, getClient, onOpenProjet, onCreateProjetAt, onOpenLot, focusLotId, onFocusHandled, currentUser, minimal = false }) {
  const canSeeCadastre = !currentUser || CADASTRE_MAP_ROLES.has(currentUser.role);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const boundaryPopupRef = useRef(null);
  const measureModeRef = useRef(null);
  const boundaryClickRef = useRef(null);
  const consultPickRef = useRef(false); // true while the Consulter panel waits for a click on the map
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
  const [activeNatures, setActiveNatures] = useState(() => new Set(Object.keys(NATURES)));
  const [measureMode, setMeasureMode] = useState(null); // null | "distance" | "area"

  measureModeRef.current = measureMode;
  const [measureTotal, setMeasureTotal] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importedPoints, setImportedPoints] = useState([]);
  const [importedShapes, setImportedShapes] = useState({ type: "FeatureCollection", features: [] }); // KML lines / polygons
  const [importError, setImportError] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [cadastreRaw, setCadastreRaw] = useState(null);
  // Agents only see the lots of the projets they can see; office sees every lot.
  // Each lot carries the nature of its projet (Plan côté, Bornage…) so it can be drawn accordingly.
  const lotsWithKind = useMemo(() => {
    if (!cadastreRaw) return cadastreRaw;
    const kindOf = Object.fromEntries(projects.map((p) => [p.id, natureKind(p)]));
    const prestationKindOf = Object.fromEntries(projects.flatMap((p) => p.prestations.map((x) => [x.id, prestationKind(x)])));
    const office = !currentUser || currentUser.role === "Dispatcher" || currentUser.role === "Directrice";
    return {
      ...cadastreRaw,
      features: cadastreRaw.features
        .filter((f) => office || kindOf[f.properties.projetId])
        .map((f) => ({ ...f, properties: { ...f.properties, kind: prestationKindOf[f.properties.prestationId] || kindOf[f.properties.projetId] || "autre" } })),
    };
  }, [cadastreRaw, projects, currentUser]);
  const cadastreGeojson = useMemo(
    () => (lotsWithKind ? { ...lotsWithKind, features: lotsWithKind.features.filter((f) => activeNatures.has(f.properties.kind)) } : lotsWithKind),
    [lotsWithKind, activeNatures],
  );
  const [showCadastreLots, setShowCadastreLots] = useState(true);
  const [showCommunes, setShowCommunes] = useState(false);
  const [adminLevel, setAdminLevel] = useState("region");
  const [adminData, setAdminData] = useState({}); // level key -> FeatureCollection
  const [adminError, setAdminError] = useState(false);
  const level = ADMIN_LEVELS.find((l) => l.key === adminLevel);
  const communes = showCommunes ? adminData[adminLevel] || null : null;
  const [panelOpen, setPanelOpen] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultFeatures, setConsultFeatures] = useState([]);
  const consultData = useMemo(() => ({ type: "FeatureCollection", features: consultFeatures }), [consultFeatures]);
  const [panelTab, setPanelTab] = useState("projets");
  // The key is tall now: open by default only where there is room (wide and tall screens).
  const [legendOpen, setLegendOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth > 700 && window.innerHeight >= 900));
  const [activeId, setActiveId] = useState(null);

  const geolocated = projects.filter((p) => p.lat != null && p.lng != null);
  // A projet shows when its status is on and at least one of its prestations is of a kind that is on.
  const visibleProjects = geolocated.filter((pr) => activeStatuses.has(projetStatus(pr)) && projetNatures(pr).some((k) => activeNatures.has(k)));
  const natureCounts = Object.fromEntries(NATURE_ORDER.map((k) => [k, 0]));
  projects.filter((pr) => activeStatuses.has(projetStatus(pr))).forEach((pr) => pr.prestations.forEach((p) => { natureCounts[prestationKind(p)] += 1; }));
  const shownPrestations = visibleProjects.reduce((n, pr) => n + pr.prestations.filter((p) => activeNatures.has(prestationKind(p))).length, 0);

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
        properties: { projetId: pr.id, color: STATUS_COLORS[projetStatus(pr)], approximate: !exactGeometry(pr), kind: natureKind(pr) },
      })),
    };

    const openPopupFor = (pr, offset = [0, -34]) => {
      const client = getClient(pr.clientId);
      const status = projetStatus(pr);
      const pLots = lotsRef.current.filter((l) => l.projetId === pr.id);
      const popupNode = document.createElement("div");
      popupNode.className = "mp-sheet";
      popupNode.innerHTML = `
        <div class="mp-sheet-eyebrow">
          <span class="gt-mono">${esc(pr.id)}</span>
          <span class="mp-pill" style="--pc:${STATUS_COLORS[status]}">${esc(STATUS_LABELS[status])}</span>
        </div>
        <h3 class="mp-sheet-client">${esc(client?.nom || "—")}</h3>
        <div class="mp-sheet-where">${esc(pr.situation || "—")}${pr.referenceFonciere ? ` · Réf. ${esc(pr.referenceFonciere)}` : ""}</div>
        <div class="mp-sheet-section"><span>Prestations</span><em>${pr.prestations.length}</em></div>
        ${pr.prestations.length ? `<ul class="mp-pr-list">${pr.prestations.map(prestationRowHTML).join("")}</ul>` : '<div class="mp-sheet-empty">Aucune prestation pour le moment.</div>'}
        ${pLots.length ? `<div class="mp-sheet-section"><span>Lots cadastraux</span><em>${pLots.length}</em></div>
          <div class="mp-card-lots">${pLots.map((l) => `<span class="mp-lotchip" style="--lc:${LOT_COLORS[l.statut]}"><i></i> Titre ${esc(l.titre)} · ${esc(LOT_STATUT_LABEL[l.statut])}${l.conforme ? "" : " · écart"}</span>`).join("")}</div>` : ""}
        <div class="mp-sheet-coords gt-mono">Lambert : ${esc(formatLambert(pr.lat, pr.lng))}${exactGeometry(pr) ? "" : " · emprise indicative"}</div>
      `;
      const actions = document.createElement("div");
      actions.className = "mp-sheet-actions";
      const open = document.createElement("button");
      open.className = "mp-btn is-primary";
      open.textContent = "Ouvrir le projet";
      open.onclick = () => onOpenProjet(pr.id);
      actions.appendChild(open);
      if (pLots.length && onOpenLot) {
        const lotBtn = document.createElement("button");
        lotBtn.className = "mp-btn";
        lotBtn.textContent = pLots.length > 1 ? "Voir les lots" : "Voir le lot";
        lotBtn.onclick = () => onOpenLot(pLots[0].id);
        actions.appendChild(lotBtn);
      }
      popupNode.appendChild(actions);
      return new MaplibrePopup({ offset, maxWidth: "330px", className: "mp-popup" }).setDOMContent(popupNode);
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
        el.innerHTML = pinSVG(STATUS_COLORS[status], natureKind(pr), pr.prestations.length);
        el.classList.add(`is-${natureKind(pr)}`);
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
            "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.4, ["==", ["get", "kind"], "plan"], 0.24, 0.1],
          },
        });
        // line-dasharray can't be data-driven, so approximate (dashed) and surveyed (solid) outlines are two layers.
        map.addLayer({
          id: "gt-boundary-line",
          type: "line",
          source: BOUNDARY_SOURCE_ID,
          filter: ["all", ["!=", ["get", "approximate"], true], ["==", ["get", "kind"], "plan"]],
          paint: { "line-color": ["get", "color"], "line-width": 2.6 },
        });
        // Other natures: a dotted outline instead of the plan côté's solid one.
        map.addLayer({
          id: "gt-boundary-line-other",
          type: "line",
          source: BOUNDARY_SOURCE_ID,
          filter: ["all", ["!=", ["get", "approximate"], true], ["!=", ["get", "kind"], "plan"]],
          layout: { "line-cap": "round" },
          paint: { "line-color": ["get", "color"], "line-width": 2.4, "line-dasharray": [0.1, 2] },
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
        if (measureModeRef.current || consultPickRef.current) return;
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
      // querySourceFeatures only sees tiles already rendered for the current viewport, so this
      // first call can come back empty on a fresh load (before the initial fitBounds below even
      // moves the map). "idle" fires once every pending tile/paint operation has actually
      // settled — a stronger guarantee than "data", and the one case the existing data/moveend
      // listeners could still miss (e.g. fitBounds animating to bounds the map was already at,
      // which never fires "moveend").
      map.once("idle", syncMarkers);

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
  }, [projects, activeStatuses, activeNatures, style, attempt, loaded, cadastreGeojson]);

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
  // siting a new project nearby, so they're shown by default (toggleable). Skipped entirely
  // (not just hidden) for roles that shouldn't see this layer at all.
  useEffect(() => {
    if (!canSeeCadastre) return;
    getAllCadastreLotsGeoJSON().then(setCadastreRaw).catch(() => {});
  }, [canSeeCadastre]);

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
            operation: p.operation || "",
            livre: p.livre === true,
            projetId: p.projetId || "",
            kind: p.kind || "autre",
            statut: p.statut || "brouillon",
            conforme: p.conforme !== false,
            approx: !!p.positionApproximative,
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
    lot.operation.split(",").filter(Boolean).forEach((op) => badges.appendChild(el("span", "gt-lot-chip is-op", op)));
    badges.appendChild(el("span", `gt-lot-chip ${lot.conforme ? "is-ok" : "is-bad"}`, lot.conforme ? "Surface conforme" : "Écart de surface"));
    if (lot.approx) badges.appendChild(el("span", "gt-lot-chip is-bad", "Position approximative"));
    box.appendChild(badges);
    const dossier = projects.find((x) => x.id === lot.projetId);
    if (dossier && dossier.prestations.length) {
      const section = el("div", "mp-sheet-section");
      section.innerHTML = `<span>Prestations du projet</span><em>${dossier.prestations.length}</em>`;
      box.appendChild(section);
      const list = el("ul", "mp-pr-list");
      list.innerHTML = dossier.prestations.map(prestationRowHTML).join("");
      box.appendChild(list);
    }
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
        map.addLayer({ id: "gt-cadastre-fill", type: "fill", source: CADASTRE_SOURCE_ID, paint: { "fill-color": colorByStatut, "fill-opacity": ["case", ["==", ["get", "kind"], "plan"], 0.38, 0.16] } });
        map.addLayer({ id: "gt-cadastre-line", type: "line", source: CADASTRE_SOURCE_ID, filter: ["==", ["get", "kind"], "plan"], paint: { "line-color": colorByStatut, "line-width": 3 } });
        // Lots of any other nature: a dotted outline instead of the plan côté's solid one.
        map.addLayer({ id: "gt-cadastre-line-other", type: "line", source: CADASTRE_SOURCE_ID, filter: ["!=", ["get", "kind"], "plan"], layout: { "line-cap": "round" }, paint: { "line-color": colorByStatut, "line-width": 2.6, "line-dasharray": [0.1, 2] } });
        // surface gap: dashed red outline on top
        map.addLayer({ id: "gt-cadastre-ecart", type: "line", source: CADASTRE_SOURCE_ID, filter: ["==", ["get", "conforme"], false], paint: { "line-color": "#b3261e", "line-width": 2.6, "line-dasharray": [2, 1.5] } });
        map.addLayer({ id: "gt-cadastre-focus", type: "line", source: CADASTRE_SOURCE_ID, filter: ["==", ["get", "id"], ""], paint: { "line-color": "#1d1b18", "line-width": 5 } });
        map.on("click", "gt-cadastre-fill", (e) => {
          if (measureModeRef.current || consultPickRef.current) return;
          openLotFromMap(e.features[0].properties.id, e.lngLat);
        });
        map.on("mouseenter", "gt-cadastre-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "gt-cadastre-fill", () => { map.getCanvas().style.cursor = ""; });
      } else {
        map.getSource(CADASTRE_SOURCE_ID).setData(cadastreGeojson);
      }
      const visibility = showCadastreLots ? "visible" : "none";
      ["gt-cadastre-halo", "gt-cadastre-fill", "gt-cadastre-line", "gt-cadastre-line-other", "gt-cadastre-ecart", "gt-cadastre-focus"].forEach((id) => map.setLayoutProperty(id, "visibility", visibility));
      applyLotFocus(map);
    };

    if (loaded) setup();
    else map.once("load", setup);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadastreGeojson, showCadastreLots, style, attempt, loaded]);

  // Administrative boundaries: dashed borders, the area under the pointer is outlined and named in a tooltip, and
  // the names of the areas in view are printed on the map (more of them the further you zoom in).
  useEffect(() => {
    if (!showCommunes || adminData[adminLevel]) return;
    setAdminError(false);
    fetch(level.url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => setAdminData((d) => ({ ...d, [adminLevel]: data })))
      .catch(() => setAdminError(true));
  }, [showCommunes, adminLevel, adminData, level.url]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !communes) return undefined;

    const setup = () => {
      if (!map.getSource(COMMUNES_SOURCE_ID)) {
        map.addSource(COMMUNES_SOURCE_ID, { type: "geojson", data: communes, promoteId: "code", attribution: "Limites © OpenStreetMap contributors (ODbL) · codes HCP" });
        // Under the cadastral lots, so a lot always stays clickable on top of its area.
        const below = map.getLayer("gt-cadastre-halo") ? "gt-cadastre-halo" : undefined;
        map.addLayer({ id: "gt-communes-fill", type: "fill", source: COMMUNES_SOURCE_ID, paint: { "fill-color": "#b3261e", "fill-opacity": 0.015 } }, below);
        const hovered = ["boolean", ["feature-state", "hover"], false];
        map.addLayer({ id: "gt-communes-hover", type: "fill", source: COMMUNES_SOURCE_ID, paint: { "fill-color": "#b3261e", "fill-opacity": ["case", hovered, 0.2, 0], "fill-opacity-transition": { duration: 160 } } }, below);
        map.addLayer({ id: "gt-communes-halo", type: "line", source: COMMUNES_SOURCE_ID, paint: { "line-color": "#fbf7ee", "line-width": 4.2, "line-opacity": 0.8, "line-blur": 0.6 } }, below);
        map.addLayer({ id: "gt-communes-hoverline", type: "line", source: COMMUNES_SOURCE_ID, paint: { "line-color": "#b3261e", "line-width": ["case", hovered, 3, 0], "line-opacity": 0.9 } }, below);
        map.addLayer({ id: "gt-communes-line", type: "line", source: COMMUNES_SOURCE_ID, paint: { "line-color": "#3b2a20", "line-width": 1.5, "line-dasharray": [4, 2] } }, below);
      } else {
        map.getSource(COMMUNES_SOURCE_ID).setData(communes);
      }
      ["gt-communes-fill", "gt-communes-hover", "gt-communes-hoverline", "gt-communes-halo", "gt-communes-line"].forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", "visible"));
    };

    if (loaded) setup();
    else map.once("load", setup);
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communes, style, attempt, loaded]);

  // Each level has its own line convention (weight, dash, ink) — applied whenever the level or the map style changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !communes || !map.getLayer("gt-communes-line")) return;
    const { color, width, dash } = level.line;
    map.setPaintProperty("gt-communes-line", "line-color", color);
    map.setPaintProperty("gt-communes-line", "line-width", ["interpolate", ["linear"], ["zoom"], width[0], width[1], width[2], width[3]]);
    map.setPaintProperty("gt-communes-line", "line-dasharray", dash);
    map.setPaintProperty("gt-communes-halo", "line-width", width[3] + 2.4);
  }, [communes, level, style, attempt, loaded]);

  // Toggled off: hide the layers (they stay in the map, so switching back on is instant).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || showCommunes) return;
    ["gt-communes-fill", "gt-communes-hover", "gt-communes-hoverline", "gt-communes-halo", "gt-communes-line"].forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", "none"));
  }, [showCommunes, loaded]);

  // Hover: wash + outline the area under the pointer (feature-state, so nothing is re-filtered per move) and
  // name it in a card that follows the pointer. Click zooms into the area and drops one level (région → provinces
  // → communes). Lots and measuring keep priority: a click on a lot, or while measuring, is left to them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !communes || !loaded || !showCommunes) return undefined;
    const tip = new MaplibrePopup({ closeButton: false, closeOnClick: false, offset: 16, className: "gt-commune-tip", anchor: "top-left" });
    let hoveredCode = null;
    let frame = 0;
    let last = null;

    const setHover = (code) => {
      if (code === hoveredCode) return;
      if (hoveredCode != null) map.setFeatureState({ source: COMMUNES_SOURCE_ID, id: hoveredCode }, { hover: false });
      if (code != null) map.setFeatureState({ source: COMMUNES_SOURCE_ID, id: code }, { hover: true });
      hoveredCode = code;
    };
    const lotAt = (point) => map.getLayer("gt-cadastre-fill") && map.queryRenderedFeatures(point, { layers: ["gt-cadastre-fill"] }).length > 0;

    const update = () => {
      frame = 0;
      const e = last;
      if (!e || measureModeRef.current || !map.getLayer("gt-communes-fill")) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["gt-communes-fill"] })[0];
      if (!f) {
        setHover(null);
        tip.remove();
        map.getCanvas().style.cursor = "";
        return;
      }
      if (!lotAt(e.point)) map.getCanvas().style.cursor = "zoom-in";
      if (f.properties.code !== hoveredCode) {
        setHover(f.properties.code);
        const p = f.properties;
        const box = el("div", "gt-commune-tip-body");
        box.appendChild(el("span", "gt-tip-eyebrow", level.eyebrow(p)));
        box.appendChild(el("strong", "", p.nom));
        level.lines(p).forEach((t) => box.appendChild(el("span", "gt-tip-line", t)));
        const stats = level.stats(p);
        if (stats.length) {
          const row = el("div", "gt-tip-stats");
          stats.forEach(([v, l]) => {
            const cell = el("span", "");
            cell.appendChild(el("b", "", String(v)));
            cell.appendChild(document.createTextNode(` ${l}`));
            row.appendChild(cell);
          });
          box.appendChild(row);
        }
        if (level.next) box.appendChild(el("span", "gt-tip-hint", `Cliquer pour zoomer · ${level.next.label.toLowerCase()}`));
        tip.setDOMContent(box);
      }
      tip.setLngLat(e.lngLat).addTo(map);
    };
    const move = (e) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const leave = () => {
      last = null;
      setHover(null);
      tip.remove();
      map.getCanvas().style.cursor = "";
    };
    const click = (e) => {
      if (measureModeRef.current || lotAt(e.point)) return;
      const f = map.queryRenderedFeatures(e.point, { layers: ["gt-communes-fill"] })[0];
      const full = f && communes.features.find((x) => x.properties.code === f.properties.code);
      if (!full) return;
      const pts = (full.geometry.type === "Polygon" ? [full.geometry.coordinates] : full.geometry.coordinates).flatMap((poly) => poly[0]);
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, duration: 900, maxZoom: 13 });
      if (level.next) setAdminLevel(level.next.key);
      leave();
    };
    map.on("mousemove", move);
    map.on("click", click);
    map.getCanvas().addEventListener("mouseleave", leave);
    return () => {
      map.off("mousemove", move);
      map.off("click", click);
      map.getCanvas()?.removeEventListener("mouseleave", leave);
      if (frame) cancelAnimationFrame(frame);
      leave();
    };
  }, [communes, showCommunes, loaded, level]);

  // Names of the areas in view (capped, never blocking clicks).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !communes || !loaded || !showCommunes) return undefined;
    let markers = [];
    const clear = () => { markers.forEach((m) => m.remove()); markers = []; };
    const draw = () => {
      clear();
      if (map.getZoom() < level.labelZoom) return;
      const b = map.getBounds();
      communes.features
        .filter((f) => f.properties.c && b.contains(f.properties.c))
        .slice(0, level.maxLabels)
        .forEach((f) => {
          const label = el("div", `gt-commune-label is-${level.key}`, f.properties.nom);
          markers.push(new MaplibreMarker({ element: label, anchor: "center" }).setLngLat(f.properties.c).addTo(map));
        });
    };
    draw();
    map.on("moveend", draw);
    return () => { map.off("moveend", draw); clear(); };
  }, [communes, showCommunes, loaded, level]);

  // Pins at each lot's centre: a lot of 100 m is invisible at city zoom, so the pin is what you spot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !showCadastreLots) return undefined;
    const pins = lots.map((lot) => {
      const pin = el("button", `gt-lot-pin is-${lot.statut} is-kind-${lot.kind === "plan" ? "plan" : "other"}${lot.conforme ? "" : " is-gap"}`);
      pin.type = "button";
      pin.title = `${lot.propriete} — Titre ${lot.titre}${lot.operation ? ` — ${lot.operation.split(",").join(" + ")}` : ""}`;
      pin.innerHTML = lot.kind === "plan" ? LOT_GLYPH_PLAN : LOT_GLYPH_OTHER;
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

  // Imported KML lines and polygons: a fill + outline that sit above the projets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return undefined;
    const setup = () => {
      if (!map.getSource(IMPORT_SHAPES_ID)) {
        map.addSource(IMPORT_SHAPES_ID, { type: "geojson", data: importedShapes });
        map.addLayer({ id: "gt-import-fill", type: "fill", source: IMPORT_SHAPES_ID, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2F4858", "fill-opacity": 0.22 } });
        map.addLayer({ id: "gt-import-line", type: "line", source: IMPORT_SHAPES_ID, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2F4858", "line-width": 2.6 } });
        const onClick = (e) => {
          if (measureModeRef.current || consultPickRef.current) return;
          const f = e.features?.[0];
          if (!f) return;
          const box = document.createElement("div");
          box.className = "gt-map-popup";
          const title = document.createElement("div");
          title.className = "gt-map-popup-client";
          title.textContent = f.properties?.name || "Élément importé";
          box.appendChild(title);
          if (f.properties?.description) {
            const d = document.createElement("div");
            d.className = "gt-map-popup-meta";
            d.textContent = String(f.properties.description).replace(/<[^>]*>/g, " ").trim().slice(0, 240);
            box.appendChild(d);
          }
          new MaplibrePopup({ maxWidth: "260px" }).setLngLat(e.lngLat).setDOMContent(box).addTo(map);
        };
        ["gt-import-fill", "gt-import-line"].forEach((id) => {
          map.on("click", id, onClick);
          map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
        });
      } else {
        map.getSource(IMPORT_SHAPES_ID).setData(importedShapes);
      }
    };
    if (map.isStyleLoaded()) setup();
    else map.once("idle", setup);
    if (importedShapes.features.length > 0) {
      const bounds = new LngLatBounds();
      const walk = (c) => (typeof c[0] === "number" ? bounds.extend(c) : c.forEach(walk));
      importedShapes.features.forEach((f) => walk(f.geometry.coordinates));
      map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 500 });
    }
    return undefined;
  }, [importedShapes, loaded, style, attempt]);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      let points;
      let shapes = { type: "FeatureCollection", features: [] };
      if (/\.kml$/i.test(file.name)) ({ points, shapes } = parseKML(text));
      else points = parseImportFile(file.name, text);
      if (points.length === 0 && shapes.features.length === 0) {
        setImportError("Aucun point ni tracé trouvé dans ce fichier.");
        return;
      }
      setImportedPoints(points);
      setImportedShapes(shapes);
    } catch {
      setImportError("Impossible de lire ce fichier (KML, GPX ou CSV attendu).");
    }
  };

  const clearImported = () => {
    setImportedPoints([]);
    setImportedShapes({ type: "FeatureCollection", features: [] });
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

  const BASEMAPS = [
    { key: "street", label: "Plan", sub: "Rues et toponymes" },
    { key: "satellite", label: "Satellite", sub: "Imagerie aérienne" },
    { key: "topo", label: "Topographie", sub: "Relief et courbes" },
  ];
  const chooseBasemap = (key) => {
    setRasterFallback(false);
    setBasemap(key);
  };

  const toggleStatus = (key) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size === 0 ? new Set(Object.keys(STATUS_LABELS)) : next;
    });
  };

  const toggleNature = (key) => {
    setActiveNatures((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size === 0 ? new Set(Object.keys(NATURES)) : next;
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
    return lots.filter((l) => l.titre.toLowerCase().includes(q) || l.propriete.toLowerCase().includes(q) || l.projetId.toLowerCase().includes(q) || l.operation.toLowerCase().includes(q)).slice(0, 5);
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
      <MapRibbon
        dossiers={projects.length}
        onMap={geolocated.length}
        prestations={shownPrestations}
        lots={lots.length}
        natureCounts={natureCounts}
        activeNatures={activeNatures}
        onToggleNature={toggleNature}
        statusCounts={counts}
        activeStatuses={activeStatuses}
        onToggleStatus={toggleStatus}
      />
      <div className="gt-map-wrap">
        <div ref={containerRef} className="gt-map" />
        {showCommunes && (
          <div className="gt-level-switch" role="group" aria-label="Niveau de découpage administratif" style={{ "--i": ADMIN_LEVELS.findIndex((l) => l.key === adminLevel) }}>
            <span className="gt-level-thumb" aria-hidden="true" />
            {ADMIN_LEVELS.map((l) => (
              <button key={l.key} type="button" className={adminLevel === l.key ? "is-on" : ""} onClick={() => setAdminLevel(l.key)} aria-pressed={adminLevel === l.key}>
                <b>{l.label}</b>
                <em>{l.count}</em>
              </button>
            ))}
          </div>
        )}
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

        <div className="gt-map-toolbar gt-rail" role="toolbar" aria-label="Outils de la carte">
          <div className="gt-rail-group" style={{ "--g": 0 }}>
            <span className="gt-rail-cap">Fond</span>
            <div className="gt-rail-item gt-basemap">
              <button type="button" className="gt-rail-btn" aria-haspopup="menu" aria-label={`Fond de carte : ${BASEMAPS.find((b) => b.key === basemap).label}`}>
                <span className={`gt-swatch is-${basemap}`} />
              </button>
              <div className="gt-basemap-fly" role="menu" aria-label="Fond de carte">
                {BASEMAPS.map((b) => (
                  <button key={b.key} type="button" role="menuitemradio" aria-checked={basemap === b.key} className={basemap === b.key ? "is-on" : ""} onClick={() => chooseBasemap(b.key)}>
                    <span className={`gt-swatch is-${b.key}`} />
                    <b>{b.label}</b>
                    <em>{b.sub}</em>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {!minimal && (
            <>
              <div className="gt-rail-group" style={{ "--g": 1 }}>
                <span className="gt-rail-cap">Mesure</span>
                <div className="gt-rail-item">
                  <button type="button" className={`gt-rail-btn ${measureMode === "distance" ? "active" : ""}`} onClick={() => toggleMeasure("distance")} aria-pressed={measureMode === "distance"} aria-label="Mesurer une distance">
                    <Ruler size={17} />
                  </button>
                  <span className="gt-tip"><b>Distance</b><em>Poser des points sur la carte</em></span>
                </div>
                <div className="gt-rail-item">
                  <button type="button" className={`gt-rail-btn ${measureMode === "area" ? "active" : ""}`} onClick={() => toggleMeasure("area")} aria-pressed={measureMode === "area"} aria-label="Mesurer une surface">
                    <Shapes size={17} />
                  </button>
                  <span className="gt-tip"><b>Surface</b><em>Tracer un polygone</em></span>
                </div>
              </div>
              <div className="gt-rail-group" style={{ "--g": 2 }}>
                <span className="gt-rail-cap">Couches</span>
                {canSeeCadastre && (
                  <div className="gt-rail-item">
                    <button type="button" className={`gt-rail-btn ${showCadastreLots ? "active" : ""}`} onClick={() => setShowCadastreLots((v) => !v)} aria-pressed={showCadastreLots} aria-label="Afficher ou masquer les lots cadastraux">
                      <FileScan size={17} />
                      {lots.length > 0 && <i className="gt-rail-badge">{lots.length}</i>}
                    </button>
                    <span className="gt-tip"><b>Lots cadastraux</b><em>{showCadastreLots ? "Affichés" : "Masqués"} · {lots.length} lot{lots.length > 1 ? "s" : ""}</em></span>
                  </div>
                )}
                <div className="gt-rail-item">
                  <button type="button" className={`gt-rail-btn ${showCommunes ? "active" : ""}`} onClick={() => setShowCommunes((v) => !v)} aria-pressed={showCommunes} aria-label="Afficher ou masquer les limites administratives">
                    <Landmark size={17} />
                    {showCommunes && !communes && !adminError && <span className="gt-rail-spin" aria-hidden="true" />}
                  </button>
                  <span className="gt-tip"><b>Limites</b><em>{adminError ? "Indisponibles" : "Régions · provinces · communes"}</em></span>
                </div>
              </div>
              <div className="gt-rail-group" style={{ "--g": 3 }}>
                <span className="gt-rail-cap">Données</span>
                <div className="gt-rail-item">
                  <button type="button" className={`gt-rail-btn ${consultOpen ? "active" : ""}`} onClick={() => { setConsultOpen((v) => !v); setPanelOpen(false); }} aria-expanded={consultOpen} aria-label="Consulter une position">
                    <ScanSearch size={17} />
                  </button>
                  <span className="gt-tip"><b>Consulter</b><em>Projets proches d'une position, d'une parcelle ou de vous</em></span>
                </div>
                <div className="gt-rail-item">
                  <button type="button" className={`gt-rail-btn ${panelOpen ? "active" : ""}`} onClick={() => { setPanelOpen((v) => !v); setConsultOpen(false); }} aria-expanded={panelOpen} aria-label="Liste des projets affichés">
                    <ListIcon size={17} />
                    <i className="gt-rail-badge">{visibleProjects.length}</i>
                  </button>
                  <span className="gt-tip"><b>Projets</b><em>Liste des projets affichés</em></span>
                </div>
                <div className="gt-rail-item">
                  <button type="button" className="gt-rail-btn" onClick={() => fileInputRef.current?.click()} aria-label="Importer un fichier KML, GPX ou CSV">
                    <Upload size={17} />
                  </button>
                  <span className="gt-tip"><b>Importer</b><em>Fichier KML, GPX ou CSV</em></span>
                </div>
                <div className="gt-rail-item">
                  <button type="button" className="gt-rail-btn" onClick={exportPdf} disabled={exportingPdf} aria-label="Exporter la carte en PDF">
                    {exportingPdf ? <span className="gt-rail-spin is-inline" aria-hidden="true" /> : <Printer size={17} />}
                  </button>
                  <span className="gt-tip"><b>{exportingPdf ? "Export en cours…" : "Exporter en PDF"}</b><em>La vue actuelle de la carte</em></span>
                </div>
              </div>
            </>
          )}
          <input ref={fileInputRef} type="file" accept=".kml,.gpx,.csv,text/csv,application/gpx+xml,application/vnd.google-earth.kml+xml" style={{ display: "none" }} onChange={handleImportFile} />
        </div>

        {(importedPoints.length > 0 || importedShapes.features.length > 0 || importError) && (
          <div className="gt-map-measure-badge" style={{ top: 50 }}>
            {importError || [
              importedPoints.length > 0 && `${importedPoints.length} point${importedPoints.length > 1 ? "s" : ""}`,
              importedShapes.features.length > 0 && `${importedShapes.features.length} tracé${importedShapes.features.length > 1 ? "s" : ""}`,
            ].filter(Boolean).join(" · ") + " importé(s)"}
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
          <div className="gt-map-measure-badge" role="status">
            <span className="gt-measure-pulse" aria-hidden="true" />
            {measureMode === "distance" ? <Ruler size={14} /> : <Shapes size={14} />}
            <span className={measureTotal ? "gt-measure-value" : "gt-measure-hint"}>{measureTotal || (measureMode === "distance" ? "Cliquez pour placer des points" : "Cliquez pour tracer la surface")}</span>
            <button className="gt-iconbtn" onClick={clearMeasure} title="Effacer">
              <X size={13} />
            </button>
          </div>
        )}

        <div className={`gt-map-legend mp-key ${legendOpen ? "" : "is-collapsed"}`}>
          <button type="button" className="gt-map-legend-title" onClick={() => setLegendOpen((v) => !v)} aria-expanded={legendOpen}>
            Clé de la carte <ChevronDown size={12} className="gt-map-legend-chev" />
          </button>
          {legendOpen && (
            <>
              <div className="mp-key-row"><span className="mp-key-pin" dangerouslySetInnerHTML={{ __html: pinSVG("#7a7266", "plan") }} /> Plan côté <small>contour plein</small></div>
              <div className="mp-key-row"><span className="mp-key-pin" dangerouslySetInnerHTML={{ __html: pinSVG("#7a7266", "mec", 2) }} /> Autres prestations <small>contour pointillé · nombre = prestations du projet</small></div>
              <div className="mp-key-sep">Couleur du repère = statut du projet</div>
              {showCadastreLots && lots.length > 0 && (
                <>
                  <div className="mp-key-sep">Lots cadastraux</div>
                  {Object.keys(LOT_COLORS).map((k) => (
                    <div key={k} className="mp-key-row"><span className="gt-lot-swatch" style={{ background: LOT_COLORS[k] }} /> {LOT_STATUT_LABEL[k]} <small>{lots.filter((l) => l.statut === k).length}</small></div>
                  ))}
                  <div className="mp-key-row"><span className="gt-lot-swatch is-gap" /> Écart de surface <small>{lots.filter((l) => !l.conforme).length}</small></div>
                </>
              )}
            </>
          )}
        </div>

        <ConsultLayers map={mapRef.current} loaded={loaded} data={consultData} styleKey={`${style === VECTOR_STYLE ? "v" : basemap}${attempt}`} />
        {consultOpen && (
          <ConsultPanel
            map={mapRef.current}
            onFeatures={setConsultFeatures}
            onPicking={(v) => { consultPickRef.current = v; }}
            onFocusProjet={(id, n) => {
              const pr = projects.find((p) => p.id === id);
              if (pr && pr.lat != null) focusProject(pr);
              else if (n?.geometry && mapRef.current) {
                const c = n.geometry.type === "Point" ? n.geometry.coordinates : (n.geometry.type === "Polygon" ? n.geometry.coordinates[0][0] : null);
                if (c) mapRef.current.flyTo({ center: c, zoom: 17, duration: 700 });
              } else if (n?.lat != null) mapRef.current?.flyTo({ center: [n.lng, n.lat], zoom: 17, duration: 700 });
            }}
            onClose={() => { setConsultOpen(false); consultPickRef.current = false; }}
          />
        )}
        {panelOpen && (
          <MapPanel
            projets={visibleProjects}
            lots={lots}
            getClient={getClient}
            activeId={activeId}
            tab={panelTab}
            onTab={setPanelTab}
            onFocusProject={focusProject}
            onFocusLot={focusLot}
            onClose={() => setPanelOpen(false)}
          />
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
