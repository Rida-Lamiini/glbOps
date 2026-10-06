import React, { useEffect, useMemo, useRef, useState } from "react";
import { LngLatBounds } from "maplibre-gl";
import { AlertTriangle, CheckCircle2, Crosshair, ExternalLink, FileText, Loader2, LocateFixed, MapPin, Navigation, Plus, Route as RouteIcon, Search, Upload, X } from "lucide-react";
import { forwardGeocode } from "../../utils/geocode";
import { saveBlob } from "../../utils/saveBlob";
import { consult, consultFile, consultReport, errorText, fmtDistance, nearMe, planRoute } from "./consultApi";
import { resultFeatures, routeFeatures } from "./ConsultLayers";

const RADII = [100, 200, 500, 1000];
const RELATION = { dans: "Dans", chevauche: "Chevauche", mitoyen: "Mitoyen", proche: "Proche", titre: "Même titre" };
const VERDICT = {
  ok: { tone: "ok", icon: CheckCircle2, title: "Aucun conflit", text: "Aucun levé existant ne couvre cette position." },
  warning: { tone: "warn", icon: AlertTriangle, title: "À vérifier", text: "Des projets existants touchent cette position." },
  danger: { tone: "bad", icon: AlertTriangle, title: "Levé déjà livré", text: "Un levé livré ou validé la couvre déjà : réutilisez-le." },
};
const STAGE = { demande: "Demande", prestation: "Prestation", affectation: "Affectation", execution: "Exécution", bureau: "Bureau", controle: "Contrôle", livraison: "Livré" };

const ANCFCC_EXAMPLE = "B14 X : 369020.33 Y : 371666.77\nB15 X : 369044.25 Y : 371645.55\nB28 X : 369084.01 Y : 371690.32";

function fitTo(map, geometry) {
  const b = new LngLatBounds();
  const walk = (c) => (typeof c[0] === "number" ? b.extend(c) : c.forEach(walk));
  walk(geometry.coordinates);
  if (!b.isEmpty()) map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 60, right: 420 }, maxZoom: 18, duration: 600 });
}

// Neighbours as dots around the consulted spot: distance from the centre, compass direction around it.
function Radar({ result, onPick }) {
  const R = 78, rad = result.query.radius_m;
  const dots = result.neighbours.filter((n) => n.distance_m != null).map((n, i) => {
    const a = ((n.bearing || 0) * Math.PI) / 180;
    const r = Math.max(10, Math.min(1, n.distance_m / rad) * R);
    return { n, i, x: 90 + Math.sin(a) * r, y: 90 - Math.cos(a) * r, hot: n.relation === "chevauche" || n.relation === "dans" };
  });
  return (
    <svg className="cs-radar" viewBox="0 0 180 180" role="img" aria-label="Projets voisins autour de la position consultée">
      {[1, 2 / 3, 1 / 3].map((f) => <circle key={f} cx="90" cy="90" r={R * f} />)}
      <path d="M90 8v164M8 90h164" className="cs-radar-axis" />
      {[["N", 90, 7], ["E", 175, 93], ["S", 90, 177], ["O", 5, 93]].map(([t, x, y]) => <text key={t} x={x} y={y} textAnchor="middle" className="cs-radar-cardinal">{t}</text>)}
      <text x="90" y={90 - R / 3 + 3} textAnchor="middle" className="cs-radar-scale">{Math.round(rad / 3)} m</text>
      <circle cx="90" cy="90" r="4.5" className="cs-radar-me" />
      {dots.map((d) => (
        <g key={d.i} className={`cs-radar-dot${d.hot ? " is-hot" : ""}`} style={{ animationDelay: `${d.i * 70}ms` }} onClick={() => onPick?.(d.n)} tabIndex={0} role="button" aria-label={`${d.n.client} à ${Math.round(d.n.distance_m)} m ${d.n.direction}`} onKeyDown={(e) => e.key === "Enter" && onPick?.(d.n)}>
          <circle cx={d.x} cy={d.y} r="6.5" />
          <title>{`${d.n.client} — ${Math.round(d.n.distance_m)} m ${d.n.direction}`}</title>
        </g>
      ))}
    </svg>
  );
}

// "Consulter" — the panel that answers "what do we already have around here?" for a position, a parcel
// (ANCFCC bornes, KML, CSV…) or the agent's own phone position.
export default function ConsultPanel({ map, onFeatures, onPicking, onFocusProjet, onClose, canPickPosition = true, canCreate = false, onCreateHere, unlocated = [], onPlace }) {
  // field agents on a phone mostly want "what is around me"
  const [tab, setTab] = useState(() => (!canCreate && typeof window !== "undefined" && window.matchMedia?.("(max-width: 700px)").matches ? "pres" : "position"));
  const [placeId, setPlaceId] = useState(null); // projet being placed: the next map click is its location
  const [sheetH, setSheetH] = useState(null);
  const asideRef = useRef(null);
  const [radius, setRadius] = useState(200);
  const [pos, setPos] = useState({ lat: "", lng: "", x: "", y: "", zone: "nord" });
  const [titre, setTitre] = useState("");
  const [addr, setAddr] = useState("");
  const [addrResults, setAddrResults] = useState([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [zone, setZone] = useState("nord");
  const [mode, setMode] = useState("auto");
  const [parcels, setParcels] = useState([]); // [{parcel, result}]
  const [sel, setSel] = useState(0);
  const [single, setSingle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [near, setNear] = useState(null); // {origin, results}
  const [chosen, setChosen] = useState(new Set());
  const [route, setRoute] = useState(null);
  const fileRef = useRef(null);
  const bodyRef = useRef(null);

  const result = tab === "position" ? single : parcels[sel]?.result || null;
  const parcel = tab === "position" ? null : parcels[sel]?.parcel;

  // the "À placer" tab goes away once everything is placed
  useEffect(() => { if (tab === "placer" && unlocated.length === 0) setTab("position"); }, [tab, unlocated.length]);

  // A new answer: show it from the top (the form has folded into the recap).
  useEffect(() => { if (result) requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 })); }, [result]);

  // What is drawn on the map follows what the panel shows.
  useEffect(() => {
    if (tab === "pres") onFeatures([...(near ? [{ type: "Feature", geometry: { type: "Point", coordinates: [near.origin.lng, near.origin.lat] }, properties: { role: "query" } }] : []), ...routeFeatures(near?.origin, route)]);
    else onFeatures(resultFeatures(result));
  }, [tab, result, near, route]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onFeatures([]), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick a position by clicking the map.
  useEffect(() => {
    onPicking?.(picking || !!placeId);
    if ((!picking && !placeId) || !map) return undefined;
    map.getCanvas().style.cursor = "crosshair";
    const onClick = (e) => {
      if (placeId) { onPlace?.(placeId, e.lngLat.lat, e.lngLat.lng); setPlaceId(null); return; }
      setPos((p) => ({ ...p, lat: e.lngLat.lat.toFixed(6), lng: e.lngLat.lng.toFixed(6), x: "", y: "" }));
      setPicking(false);
    };
    map.once("click", onClick);
    return () => { map.off("click", onClick); map.getCanvas().style.cursor = ""; };
  }, [picking, placeId, map]); // eslint-disable-line react-hooks/exhaustive-deps

  const positionBody = () => {
    const hasLambert = pos.x !== "" && pos.y !== "";
    if (!hasLambert && (pos.lat === "" || pos.lng === "")) throw new Error("Indiquez une position : cliquez sur la carte, saisissez latitude/longitude ou X/Y Lambert.");
    return { ...(hasLambert ? { x: pos.x, y: pos.y, zone: pos.zone } : { lat: pos.lat, lng: pos.lng }), titre: titre.trim(), radius, kind: titre.trim() && !hasLambert && pos.lat === "" ? "titre" : "position" };
  };

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e.message?.startsWith("Indiquez") ? e.message : errorText(e)); } finally { setBusy(false); }
  };

  const consultPosition = () => run(async () => {
    const r = await consult(positionBody());
    setSingle(r);
    setCollapsed(true);
    if (map) fitTo(map, r.query.circle);
  });

  const consultFromFile = () => run(async () => {
    const form = new FormData();
    if (file) form.append("file", file); else form.append("text", text);
    form.append("zone", zone);
    form.append("mode", mode);
    form.append("radius", String(radius));
    const r = await consultFile(form);
    setParcels(r.parcels);
    setSel(0);
    setCollapsed(true);
    if (r.parcels[0] && map) fitTo(map, r.parcels[0].result.query.circle);
  });

  const searchAddress = async () => {
    if (!addr.trim()) return;
    setError("");
    try { setAddrResults(await forwardGeocode(addr.trim())); } catch { setError("Recherche d'adresse indisponible (connexion internet requise)."); }
  };

  const locate = (then) => {
    if (!navigator.geolocation) { setError("La géolocalisation n'est pas disponible sur cet appareil."); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); then({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { setBusy(false); setError("Position introuvable : autorisez la localisation dans le navigateur."); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const findNear = (origin) => run(async () => {
    const r = await nearMe({ ...origin, radius: Math.max(radius, 1000) * 2, only_open: true });
    setNear({ origin, ...r });
    setChosen(new Set());
    setRoute(null);
    if (map) map.flyTo({ center: [origin.lng, origin.lat], zoom: 14, duration: 700 });
  });

  const buildRoute = () => run(async () => {
    const r = await planRoute({ start: near.origin, projet_ids: [...chosen] });
    setRoute(r);
    if (map) {
      const b = new LngLatBounds([near.origin.lng, near.origin.lat], [near.origin.lng, near.origin.lat]);
      r.stops.forEach((s) => b.extend([s.lng, s.lat]));
      map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 60, right: 420 }, maxZoom: 16, duration: 600 });
    }
  });

  // Snapshot of the map as drawn now (fitted to the search circle) for the PDF report.
  const snapshot = () => new Promise((resolve) => {
    if (!map || !result) return resolve(null);
    fitTo(map, result.query.circle);
    const grab = () => map.once("render", () => { try { resolve(map.getCanvas().toDataURL("image/jpeg", 0.85)); } catch { resolve(null); } });
    map.once("idle", grab);
    map.triggerRepaint();
    setTimeout(() => resolve(null), 6000);
  });

  const downloadReport = () => run(async () => {
    const q = result.query;
    const ring = parcel?.kind === "polygon" ? parcel.bornes.map((b) => [b.lat, b.lng]) : null;
    const body = { ...(ring ? { ring } : { lat: q.lat, lng: q.lng }), titre: q.titre, radius: q.radius_m, label: parcel?.name || "", map_png: await snapshot() };
    saveBlob(await consultReport(body), `Consultation-${(parcel?.name || "position").replace(/[^\w-]+/g, "_")}.pdf`);
  });

  // Phone bottom sheet: drag the handle to give the map or the list more room.
  const dragSheet = (e) => {
    const el = asideRef.current;
    if (!el) return;
    const startY = e.clientY, startH = el.getBoundingClientRect().height;
    const move = (ev) => setSheetH(Math.max(150, Math.min(window.innerHeight * 0.85, startH + (startY - ev.clientY))));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startPlacing = async (u) => {
    setPlaceId(u.id);
    if (u.situation && map) {
      try { const [g] = await forwardGeocode(`${u.situation}, Maroc`); if (g) map.flyTo({ center: [g.lng, g.lat], zoom: 15, duration: 700 }); } catch { /* the agent can pan by hand */ }
    }
  };

  const v = result ? VERDICT[result.summary.status] : null;
  const sortedNear = useMemo(() => near?.results || [], [near]);

  return (
    <aside ref={asideRef} className="gt-map-panel mp-panel cs-panel" aria-label="Consulter une position" style={sheetH ? { height: sheetH, maxHeight: "85%" } : undefined}>
      <div className="cs-handle" onPointerDown={dragSheet} role="separator" aria-label="Redimensionner le panneau"><i /></div>
      <div className="mp-panel-head">
        <div className="mp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "position"} className={tab === "position" ? "is-on" : ""} onClick={() => { setTab("position"); setCollapsed(false); }}>Position</button>
          <button type="button" role="tab" aria-selected={tab === "fichier"} className={tab === "fichier" ? "is-on" : ""} onClick={() => { setTab("fichier"); setCollapsed(false); }}>Mappe/fichier</button>
          <button type="button" role="tab" aria-selected={tab === "pres"} className={tab === "pres" ? "is-on" : ""} onClick={() => setTab("pres")}>Près de moi</button>
          {canCreate && unlocated.length > 0 && <button type="button" role="tab" aria-selected={tab === "placer"} className={tab === "placer" ? "is-on" : ""} onClick={() => setTab("placer")}>À placer <em>{unlocated.length}</em></button>}
        </div>
        <button className="gt-iconbtn" onClick={onClose} aria-label="Fermer"><X size={15} /></button>
      </div>

      <div className="mp-panel-list cs-body" ref={bodyRef}>
        {tab === "placer" && (
          <div className="cs-form">
            <p className="cs-hint">Ces projets n'ont pas de position : ils restent invisibles pour les consultations. Choisissez un projet puis cliquez son emplacement sur la carte.</p>
            {placeId && <div className="cs-verdict is-warn"><MapPin size={18} /><div><b>Cliquez sur la carte</b><span>pour placer {unlocated.find((u) => u.id === placeId)?.client}.</span></div><button type="button" className="cs-link" onClick={() => setPlaceId(null)} aria-label="Annuler"><X size={14} /></button></div>}
            <div className="cs-near">
              {unlocated.map((u) => (
                <div key={u.id} className={`cs-nearrow${placeId === u.id ? " is-on" : ""}`}>
                  <span className="cs-nearmain"><b>{u.client}</b><small>{u.id}{u.titre ? ` · ${u.titre}` : ""}{u.situation ? ` · ${u.situation}` : ""}</small></span>
                  <button type="button" className="cs-btn" onClick={() => startPlacing(u)}><MapPin size={13} /> Placer</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab !== "pres" && tab !== "placer" && collapsed && result && (
          <button type="button" className="cs-recap" onClick={() => setCollapsed(false)}>
            <span><b>{parcel?.name || (single?.query.titre ? `Titre ${single.query.titre}` : `${result.query.lat.toFixed(5)}, ${result.query.lng.toFixed(5)}`)}</b><small>rayon {fmtDistance(result.query.radius_m)}{parcels.length > 1 && tab === "fichier" ? ` · parcelle ${sel + 1}/${parcels.length}` : ""}</small></span>
            <em>Modifier</em>
          </button>
        )}
        {tab !== "pres" && tab !== "placer" && !collapsed && (
          <div className="cs-radius" role="group" aria-label="Rayon de recherche">
            <span>Rayon</span>
            {RADII.map((r) => <button key={r} type="button" className={radius === r ? "is-on" : ""} onClick={() => setRadius(r)}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</button>)}
          </div>
        )}

        {tab === "position" && !collapsed && (
          <div className="cs-form">
            <div className="cs-row">
              {canPickPosition && <button type="button" className={`cs-btn ${picking ? "is-on" : ""}`} onClick={() => setPicking((p) => !p)}><MapPin size={14} /> {picking ? "Cliquez sur la carte…" : "Choisir sur la carte"}</button>}
              <button type="button" className="cs-btn" onClick={() => locate((p) => setPos((o) => ({ ...o, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), x: "", y: "" })))}><LocateFixed size={14} /> Ma position</button>
            </div>
            <div className="cs-grid">
              <label>Latitude<input inputMode="decimal" value={pos.lat} onChange={(e) => setPos({ ...pos, lat: e.target.value, x: "", y: "" })} placeholder="34.0209" /></label>
              <label>Longitude<input inputMode="decimal" value={pos.lng} onChange={(e) => setPos({ ...pos, lng: e.target.value, x: "", y: "" })} placeholder="-6.8416" /></label>
            </div>
            <div className="cs-grid cs-grid-3">
              <label>X Lambert<input inputMode="decimal" value={pos.x} onChange={(e) => setPos({ ...pos, x: e.target.value, lat: "", lng: "" })} placeholder="369020.33" /></label>
              <label>Y Lambert<input inputMode="decimal" value={pos.y} onChange={(e) => setPos({ ...pos, y: e.target.value, lat: "", lng: "" })} placeholder="371666.77" /></label>
              <label>Zone<select value={pos.zone} onChange={(e) => setPos({ ...pos, zone: e.target.value })}><option value="nord">Nord</option><option value="sud">Sud</option></select></label>
            </div>
            <label className="cs-search">
              <Search size={13} />
              <input value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchAddress()} placeholder="Ou une adresse : Hay Riad, Rabat…" />
            </label>
            {addrResults.map((a, i) => (
              <button key={i} type="button" className="cs-addr" onClick={() => { setPos({ ...pos, lat: a.lat.toFixed(6), lng: a.lng.toFixed(6), x: "", y: "" }); setAddrResults([]); }}>{a.label}</button>
            ))}
            <label>Titre foncier (facultatif)<input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="T98525/03 — détecte un levé déjà fait" /></label>
            <button type="button" className="cs-go" disabled={busy} onClick={consultPosition}>{busy ? <Loader2 size={14} className="cs-spin" /> : <Crosshair size={14} />} Consulter</button>
          </div>
        )}

        {tab === "fichier" && (!collapsed || parcels.length > 1) && (
          <div className="cs-form">
            {!collapsed && <p className="cs-hint">Collez le texte de la page « Consultation de la mappe cadastrale » (ANCFCC) ou joignez un fichier : CSV, Excel, KML, GeoJSON, GPX.</p>}
            {!collapsed && <textarea value={text} onChange={(e) => { setText(e.target.value); setFile(null); }} placeholder={ANCFCC_EXAMPLE} rows={5} />}
            {!collapsed && <div className="cs-row">
              <button type="button" className="cs-btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> {file ? file.name : "Joindre un fichier"}</button>
              {file && <button type="button" className="cs-btn" onClick={() => setFile(null)}><X size={13} /></button>}
              <input ref={fileRef} type="file" hidden accept=".csv,.txt,.tsv,.xlsx,.kml,.geojson,.json,.gpx" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
            </div>}
            {!collapsed && <div className="cs-grid">
              <label>Coordonnées Lambert<select value={zone} onChange={(e) => setZone(e.target.value)}><option value="nord">Zone Nord (Rabat, Casa…)</option><option value="sud">Zone Sud</option></select></label>
              <label>Le fichier contient<select value={mode} onChange={(e) => setMode(e.target.value)}><option value="auto">Contour(s) de parcelle</option><option value="points">Des points isolés</option></select></label>
            </div>}
            {!collapsed && <button type="button" className="cs-go" disabled={busy || (!file && !text.trim())} onClick={consultFromFile}>{busy ? <Loader2 size={14} className="cs-spin" /> : <Crosshair size={14} />} Consulter</button>}
            {parcels.length > 1 && (
              <div className="cs-parcels" role="listbox" aria-label="Parcelles du fichier">
                {parcels.map((p, i) => (
                  <button key={i} type="button" role="option" aria-selected={sel === i} className={sel === i ? "is-on" : ""} onClick={() => { setSel(i); map && fitTo(map, p.result.query.circle); }}>
                    <b>{p.parcel.name}</b><span>{p.result.summary.count} proche{p.result.summary.count > 1 ? "s" : ""}</span><i className={`cs-dot is-${p.result.summary.status}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "pres" && (
          <div className="cs-form">
            <p className="cs-hint">Les projets à faire autour de vous. Cochez ceux à visiter dans la même tournée : l'ordre le plus court est calculé.</p>
            <div className="cs-row">
              <button type="button" className="cs-go" disabled={busy} onClick={() => locate(findNear)}>{busy ? <Loader2 size={14} className="cs-spin" /> : <Navigation size={14} />} Autour de ma position</button>
            </div>
            {near && (
              <>
                <div className="cs-near">
                  {sortedNear.length === 0 && <div className="gt-list-empty">Aucun projet en cours à proximité.</div>}
                  {sortedNear.map((n) => (
                    <label key={n.projet_id} className={`cs-nearrow ${chosen.has(n.projet_id) ? "is-on" : ""}`}>
                      <input type="checkbox" checked={chosen.has(n.projet_id)} onChange={() => { const s = new Set(chosen); s.has(n.projet_id) ? s.delete(n.projet_id) : s.add(n.projet_id); setChosen(s); setRoute(null); }} />
                      <span className="cs-nearmain"><b>{n.client}</b><small>{n.label}{n.situation ? ` · ${n.situation}` : ""}</small></span>
                      <span className="cs-neardist">{fmtDistance(n.distance_m)}</span>
                      <button type="button" className="cs-link" onClick={(e) => { e.preventDefault(); onFocusProjet?.(n.projet_id, n); }} aria-label="Voir sur la carte"><Crosshair size={13} /></button>
                    </label>
                  ))}
                </div>
                <button type="button" className="cs-go" disabled={busy || chosen.size === 0} onClick={buildRoute}><RouteIcon size={14} /> Calculer la tournée ({chosen.size})</button>
              </>
            )}
            {route && (
              <div className="cs-route">
                <div className="cs-route-total"><b>{route.road_km.toString().replace(".", ",")} km</b><span>~ {Math.floor(route.total_minutes / 60)} h {String(route.total_minutes % 60).padStart(2, "0")} avec 20 min par visite</span></div>
                <ol>
                  {route.stops.map((s, i) => (
                    <li key={s.projet_id}>
                      <b>{s.client}</b><small>{s.label}</small><em>{route.legs[i] ? `${fmtDistance(route.legs[i].road_m)} · ${route.legs[i].minutes} min` : ""}</em>
                      <span className="cs-go-links">
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving`} target="_blank" rel="noreferrer">Google Maps <ExternalLink size={11} /></a>
                        <a href={`https://waze.com/ul?ll=${s.lat},${s.lng}&navigate=yes`} target="_blank" rel="noreferrer">Waze <ExternalLink size={11} /></a>
                      </span>
                    </li>
                  ))}
                </ol>
                <a className="cs-btn" href={`https://www.google.com/maps/dir/${[near.origin, ...route.stops].map((p) => `${p.lat},${p.lng}`).join("/")}`} target="_blank" rel="noreferrer"><Navigation size={14} /> Ouvrir toute la tournée dans Google Maps</a>
              </div>
            )}
          </div>
        )}

        {error && <div className="cs-error" role="alert">{error}</div>}

        {tab !== "pres" && tab !== "placer" && result && (
          <div className="cs-result">
            <div className={`cs-verdict is-${v.tone}`}><v.icon size={18} /><div><b>{v.title}</b><span>{v.text}</span></div></div>
            {result.alerts.map((a, i) => (
              <div key={i} className={`cs-alert is-${a.severity}`}><b>{a.title}</b><span>{a.message}</span></div>
            ))}
            {result.neighbours.some((n) => n.distance_m != null) && <Radar result={result} onPick={(n) => onFocusProjet?.(n.projet_id, n)} />}
            <div className="cs-facts">
              <span><b>{result.summary.count}</b> projet{result.summary.count > 1 ? "s" : ""} dans {fmtDistance(result.query.radius_m)}</span>
              {result.summary.nearest_m != null && <span>le plus proche : <b>{fmtDistance(result.summary.nearest_m)}</b></span>}
              {result.query.area_m2 > 0 && <span>surface : <b>{Math.round(result.query.area_m2).toLocaleString("fr-FR")} m²</b></span>}
              {parcel?.declared_surface_m2 && (() => {
                const gap = (result.query.area_m2 - parcel.declared_surface_m2) / parcel.declared_surface_m2;
                return <span>déclarée : <b>{Math.round(parcel.declared_surface_m2).toLocaleString("fr-FR")} m²</b>{Math.abs(gap) > 0.02 && <b className={`cs-gap${Math.abs(gap) > 0.05 ? " is-big" : ""}`}>écart {gap > 0 ? "+" : ""}{Math.round(gap * 100)} %</b>}</span>;
              })()}
            </div>
            {canCreate && result.summary.status !== "danger" && (
              <button type="button" className="cs-btn is-create" onClick={() => onCreateHere?.(result.query.lat, result.query.lng, parcel?.titre || result.query.titre || "")}><Plus size={14} /> Créer un projet ici</button>
            )}
            <button type="button" className="cs-btn" disabled={busy} onClick={downloadReport}>{busy ? <Loader2 size={14} className="cs-spin" /> : <FileText size={14} />} Rapport PDF</button>
            <div className="cs-list">
              {result.neighbours.length === 0 && <div className="gt-list-empty">Aucun projet dans ce rayon.</div>}
              {result.neighbours.map((n, i) => (
                <button key={`${n.projet_id}-${i}`} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }} type="button" className={`cs-nb ${n.relation === "chevauche" || n.relation === "dans" ? "is-hot" : ""}`} onClick={() => onFocusProjet?.(n.projet_id, n)}>
                  <span className="cs-nb-top"><b>{n.client || "Lot sans projet"}</b><em>{RELATION[n.relation]}</em></span>
                  <span className="cs-nb-sub">{n.label}{n.situation ? ` · ${n.situation}` : ""}</span>
                  <span className="cs-nb-meta">
                    {n.distance_m != null && <span>{fmtDistance(n.distance_m)} {n.direction}</span>}
                    {n.overlap_m2 > 0 && <span>{Math.round(n.overlap_m2)} m² communs</span>}
                    {n.delivered ? <span className="is-done">Livré</span> : n.prestations[0] && <span>{STAGE[n.prestations[0].stage] || n.prestations[0].stage}</span>}
                  </span>
                </button>
              ))}
              {(result.reference || []).map((r) => (
                <div key={`ref-${r.id}`} className="cs-nb is-ref"><span className="cs-nb-top"><b>{r.name}</b><em>Couche « {r.layer} »</em></span><span className="cs-nb-meta"><span>{fmtDistance(r.distance_m)} {r.direction}</span></span></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
