import React, { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, Marker as MaplibreMarker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const M_PER_DEG = 111320;
const closeRing = (r) => [...r, r[0]];
const polygonFeature = (ring) => ({ type: "Feature", properties: { kind: "polygon" }, geometry: { type: "Polygon", coordinates: [closeRing(ring)] } });
const ringCentre = (ring) => ({ lng: ring.reduce((s, p) => s + p[0], 0) / ring.length, lat: ring.reduce((s, p) => s + p[1], 0) / ring.length });

/** The base ring turned by t.deg (counter-clockwise) about its centre, then moved so that centre sits at t. Metric
 *  approximation around the lot, which is exact enough at the scale of a parcel. */
function applyTransform(ring, centre, t) {
  const kx = M_PER_DEG * Math.cos((centre.lat * Math.PI) / 180);
  const a = (t.deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ring.map(([lng, lat]) => {
    const dx = (lng - centre.lng) * kx;
    const dy = (lat - centre.lat) * M_PER_DEG;
    return [t.lng + (dx * c - dy * s) / kx, t.lat + (dx * s + dy * c) / M_PER_DEG];
  });
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** Renders a lot's polygon + reference-point markers from its GeoJSON FeatureCollection.
 *
 *  `bornePoints` ([{ i, name, lat, lng }]) switches the bornes to markers driven by the caller instead of the
 *  GeoJSON ones. With `editable` they become handles: dragging one redraws the polygon live and calls
 *  `onBorneDrag(i, lat, lng)` as it moves and `onBorneDrop(i, lat, lng)` when released. */
export default function LotMap({
  geojson, focusName = null, placing = false, onPlace = null, satellite = false,
  bornePoints = null, editable = false, onBorneDrag = null, onBorneDrop = null,
  transformMode = false, transformBase = null, transform = null, onTransformChange = null, onTransformLive = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const dropRef = useRef(onBorneDrop);
  dropRef.current = onBorneDrop;
  const dragRef = useRef(onBorneDrag);
  dragRef.current = onBorneDrag;
  const xChangeRef = useRef(onTransformChange);
  xChangeRef.current = onTransformChange;
  const xLiveRef = useRef(onTransformLive);
  xLiveRef.current = onTransformLive;

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
      // borne markers come from `bornePoints` when the caller drives them
      .filter((f) => (f.properties.kind === "borne" && !bornePoints) || f.properties.kind === "reference-point")
      .map((f) => {
        const marker = new MaplibreMarker({ color: f.properties.kind === "borne" ? "#b3261e" : "#1f6f68", scale: 0.7 })
          .setLngLat(f.geometry.coordinates);
        marker.getElement().title = f.properties.name || f.properties.label || "";
        return marker.addTo(map);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, ready]);

  // Borne handles (caller-driven). Rebuilt whenever the points change; while one is dragged the polygon is
  // redrawn from the live positions so the shape can be judged against the map as it moves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !bornePoints || transformMode) return undefined;

    const live = bornePoints.map((p) => [p.lng, p.lat]);
    const redraw = () => {
      const src = map.getSource("lot-polygon");
      if (src && live.length >= 3) {
        src.setData({ type: "Feature", properties: { kind: "polygon" }, geometry: { type: "Polygon", coordinates: [[...live, live[0]]] } });
      }
    };
    redraw();

    const markers = bornePoints.map((p, k) => {
      const node = el("div", `lw-handle${editable ? " is-editable" : ""}`);
      node.appendChild(el("span", "lw-handle-name", p.name || String(p.i + 1)));
      node.title = p.name || "";
      const marker = new MaplibreMarker({ element: node, draggable: editable, anchor: "center" }).setLngLat([p.lng, p.lat]).addTo(map);
      marker.on("dragstart", () => node.classList.add("is-dragging"));
      marker.on("drag", () => {
        const { lng, lat } = marker.getLngLat();
        live[k] = [lng, lat];
        redraw();
        dragRef.current?.(p.i, lat, lng);
      });
      marker.on("dragend", () => {
        node.classList.remove("is-dragging");
        const { lng, lat } = marker.getLngLat();
        dropRef.current?.(p.i, lat, lng);
      });
      return marker;
    });
    map._editMarkers = markers;
    return () => {
      markers.forEach((m) => m.remove());
      map._editMarkers = [];
    };
  }, [bornePoints, editable, ready, geojson, transformMode]);

  // Move / turn the whole lot: a centre handle drags it, a knob on a stem turns it about its centre (counter-
  // clockwise = positive), a click on the map jumps its centre there. The polygon follows live and the parent is
  // told the result when a gesture ends, so nothing re-renders mid-drag.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !transformMode || !transformBase || !transform) return undefined;
    const centre = ringCentre(transformBase);
    const cur = { ...transform };
    const source = () => map.getSource("lot-polygon");
    const stem = () => map.getSource("lot-xform-stem");

    const knobPx = () => {
      const c = map.project([cur.lng, cur.lat]);
      const ang = ((90 + cur.deg) * Math.PI) / 180;
      return { c, k: { x: c.x + radiusPx * Math.cos(ang), y: c.y - radiusPx * Math.sin(ang) } };
    };
    const startPoints = applyTransform(transformBase, centre, cur);
    const c0 = map.project([cur.lng, cur.lat]);
    let radiusPx = Math.max(56, ...startPoints.map((p) => Math.hypot(map.project(p).x - c0.x, map.project(p).y - c0.y)) ) + 34;

    const mover = new MaplibreMarker({ element: el("div", "lw-xh lw-xh-move"), draggable: true, anchor: "center" });
    mover.getElement().title = "Déplacer le lot";
    mover.getElement().innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>';
    const knob = new MaplibreMarker({ element: el("div", "lw-xh lw-xh-rot"), draggable: true, anchor: "center" });
    knob.getElement().title = "Pivoter le lot";
    knob.getElement().innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';

    map.addSource("lot-xform-stem", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [0, 0]] } } });
    map.addLayer({ id: "lot-xform-stem", type: "line", source: "lot-xform-stem", paint: { "line-color": "#171412", "line-width": 1.6, "line-dasharray": [2, 2] } });

    const placeKnob = () => {
      const { k } = knobPx();
      const ll = map.unproject([k.x, k.y]);
      knob.setLngLat(ll);
      stem()?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [[cur.lng, cur.lat], [ll.lng, ll.lat]] } });
    };
    const draw = () => {
      source()?.setData(polygonFeature(applyTransform(transformBase, centre, cur)));
      placeKnob();
    };
    const live = () => xLiveRef.current?.({ ...cur });
    const commit = () => xChangeRef.current?.({ ...cur });

    mover.setLngLat([cur.lng, cur.lat]).addTo(map);
    placeKnob(); // gives the knob its position before it is attached
    knob.addTo(map);
    draw();

    mover.on("dragstart", () => mover.getElement().classList.add("is-dragging"));
    mover.on("drag", () => {
      const ll = mover.getLngLat();
      cur.lng = ll.lng;
      cur.lat = ll.lat;
      draw();
      live();
    });
    mover.on("dragend", () => {
      mover.getElement().classList.remove("is-dragging");
      commit();
    });

    knob.on("dragstart", () => knob.getElement().classList.add("is-dragging"));
    knob.on("drag", () => {
      const c = map.project([cur.lng, cur.lat]);
      const p = map.project(knob.getLngLat());
      let deg = (Math.atan2(-(p.y - c.y), p.x - c.x) * 180) / Math.PI - 90;
      deg = ((deg + 540) % 360) - 180;
      cur.deg = Math.round(deg * 10) / 10;
      source()?.setData(polygonFeature(applyTransform(transformBase, centre, cur)));
      stem()?.setData({ type: "Feature", geometry: { type: "LineString", coordinates: [[cur.lng, cur.lat], [knob.getLngLat().lng, knob.getLngLat().lat]] } });
      live();
    });
    knob.on("dragend", () => {
      knob.getElement().classList.remove("is-dragging");
      commit();
    });

    const click = (e) => {
      cur.lng = e.lngLat.lng;
      cur.lat = e.lngLat.lat;
      mover.setLngLat([cur.lng, cur.lat]);
      draw();
      commit();
    };
    const onZoom = () => {
      const s2 = applyTransform(transformBase, centre, cur);
      const cc = map.project([cur.lng, cur.lat]);
      radiusPx = Math.max(56, ...s2.map((p) => Math.hypot(map.project(p).x - cc.x, map.project(p).y - cc.y))) + 34;
      placeKnob();
    };
    map.on("click", click);
    map.on("zoomend", onZoom);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", click);
      map.off("zoomend", onZoom);
      map.getCanvas().style.cursor = "";
      mover.remove();
      knob.remove();
      if (map.getLayer("lot-xform-stem")) map.removeLayer("lot-xform-stem");
      if (map.getSource("lot-xform-stem")) map.removeSource("lot-xform-stem");
    };
  }, [transformMode, transformBase, transform, ready]);

  // Satellite imagery under the lot, to judge at a glance whether it lands on a building or a field.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (satellite && !map.getSource("lot-satellite")) {
      map.addSource("lot-satellite", {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      });
      map.addLayer({ id: "lot-satellite", type: "raster", source: "lot-satellite" }, map.getLayer("lot-polygon-fill") ? "lot-polygon-fill" : undefined);
    } else if (!satellite && map.getLayer("lot-satellite")) {
      map.removeLayer("lot-satellite");
      map.removeSource("lot-satellite");
    }
  }, [satellite, ready, geojson]);

  // Selecting a borne (from the table) flies to it and enlarges its marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    [...(map._lotMarkers || []), ...(map._editMarkers || [])].forEach((m) => {
      const node = m.getElement();
      const on = focusName && node.title === focusName;
      node.style.zIndex = on ? 5 : "";
      node.classList.toggle("is-focused", Boolean(on));
      if (!node.classList.contains("lw-handle")) node.style.filter = on ? "drop-shadow(0 0 6px #b3261e) brightness(1.25)" : "";
      if (on) map.easeTo({ center: m.getLngLat(), zoom: Math.max(map.getZoom(), 18), duration: 500 });
    });
  }, [focusName, ready, geojson, bornePoints]);

  // Placement mode: a click chooses where the lot's centre should go.
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !placing) return undefined;
    map.getCanvas().style.cursor = "crosshair";
    let marker = null;
    const click = (e) => {
      marker?.remove();
      marker = new MaplibreMarker({ color: "#1f6f68" }).setLngLat(e.lngLat).addTo(map);
      onPlaceRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.on("click", click);
    return () => {
      map.off("click", click);
      marker?.remove();
      map.getCanvas().style.cursor = "";
    };
  }, [placing, ready]);

  return <div ref={containerRef} className={`cad-map${placing ? " is-placing" : ""}`} />;
}
