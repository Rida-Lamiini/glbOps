import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Layers, Move, ShieldCheck, Loader2, Map as MapIcon, MapPin, Maximize2, Minimize2, Plus, Rows3, Save, ScanLine, Trash2, Undo2, X,
} from "lucide-react";
import {
  checkLotChecksum, convertLotPoint, getCadastreLot, getCadastreLotGeoJSON, readApiError, repositionCadastreLot, saveLotAnnotations, setLotStatut, updateCadastreLot,
} from "./api";
import LotMap from "./LotMap";
import PlanAnnotator from "./PlanAnnotator";
import { notifyError, notifySuccess } from "../../utils/notify";
import "./workspace.css";

const STATUT_LABEL = { brouillon: "Brouillon", verifie: "Vérifié", valide: "Validé" };
const TOLERANCE_M2 = 1;
const LAYOUT_KEY = "glbops.lotWorkspace.layout";
const fmt = (n, d = 2) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

// Planar shoelace over the bornes as ordered in the table — the same maths the server uses.
function shoelace(rows) {
  const pts = rows.map((r) => [Number(r.x), Number(r.y)]);
  if (pts.length < 3 || pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  let s = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    s += p[0] * q[1] - q[0] * p[1];
  });
  return Math.abs(s) / 2;
}

const readLayout = () => {
  try {
    return { plan: 0.5, map: 0.55, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}") };
  } catch {
    return { plan: 0.5, map: 0.55 };
  }
};

/** Full-screen review workspace for one lot: the plan (with annotation tools), the map and the bornes
 *  side by side, plus the review actions — everything needed to check, correct and sign off a lot. */
export default function LotWorkspace({ lotId, onClose, onChanged }) {
  const [lot, setLot] = useState(null);
  const [geojson, setGeojson] = useState(null);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [pts, setPts] = useState([]); // map position of each borne row ({ lat, lng } or null for a row typed in by hand)
  const [editBornes, setEditBornes] = useState(false);
  const [dragged, setDragged] = useState(null); // { name, meters } while a handle is being moved
  const [saving, setSaving] = useState(false);
  const [statutBusy, setStatutBusy] = useState(false);
  const [focusBorne, setFocusBorne] = useState(null);
  const [satellite, setSatellite] = useState(false);
  const [xform, setXform] = useState(null); // move/turn the whole lot: { base: [[lng, lat]…], lat, lng, deg } while active
  const [xLive, setXLive] = useState(null);
  const [check, setCheck] = useState({ open: false, kind: "s", value: "", busy: false, result: null });
  const [placeBusy, setPlaceBusy] = useState(false);
  const [show, setShow] = useState({ plan: true, map: true, bornes: true });
  const [layout, setLayout] = useState(readLayout);
  const [fullscreen, setFullscreen] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [saveState, setSaveState] = useState("idle");
  const bodyRef = useRef(null);
  const rightRef = useRef(null);
  const saveTimer = useRef(null);
  const pending = useRef(null);
  const changed = useRef(false);

  const load = useCallback(async () => {
    const [l, g] = await Promise.all([getCadastreLot(lotId), getCadastreLotGeoJSON(lotId)]);
    setLot(l);
    setGeojson(g);
    setRows(l.bornes.map((b) => ({ name: b.name, x: b.xLambert, y: b.yLambert })));
    setPts(l.bornes.map((b) => ({ lat: b.lat, lng: b.lng })));
    return l;
  }, [lotId]);

  useEffect(() => {
    load()
      .then((l) => setAnnotations(l.annotations))
      .catch((e) => setError(readApiError(e, "Échec du chargement du lot.")));
  }, [load]);

  // ---- annotations: saved shortly after the last change ---------------------------------------------
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (!pending.current) return;
    const next = pending.current;
    pending.current = null;
    try {
      await saveLotAnnotations(lotId, next);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [lotId]);

  const onAnnotate = useCallback((next) => {
    setAnnotations(next);
    pending.current = next;
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 700);
  }, [flush]);

  const close = useCallback(async () => {
    await flush();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose(changed.current);
  }, [flush, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", fs);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("fullscreenchange", fs);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // ---- splitters ----------------------------------------------------------------------------------------
  const startDrag = (axis) => (e) => {
    e.preventDefault();
    const box = (axis === "plan" ? bodyRef : rightRef).current.getBoundingClientRect();
    const move = (ev) => {
      const ratio = axis === "plan" ? (ev.clientX - box.left) / box.width : (ev.clientY - box.top) / box.height;
      setLayout((l) => ({ ...l, [axis]: Math.min(0.85, Math.max(0.15, ratio)) }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLayout((l) => {
        try {
          localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
        } catch {
          /* private mode: the layout just isn't remembered */
        }
        return l;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---- bornes -------------------------------------------------------------------------------------------
  const original = useMemo(() => (lot ? lot.bornes.map((b) => ({ name: b.name, x: b.xLambert, y: b.yLambert })) : []), [lot]);
  const dirty = useMemo(
    () => rows.length !== original.length || rows.some((r, i) => r.name !== original[i].name || Number(r.x) !== Number(original[i].x) || Number(r.y) !== Number(original[i].y)),
    [rows, original],
  );
  const area = useMemo(() => shoelace(rows), [rows]);
  const ecart = lot && area != null ? area + lot.correctionLambertM2 + lot.ajustementsM2 - lot.surfaceDocumentM2 : null;
  const conforme = ecart != null && Math.abs(ecart) <= TOLERANCE_M2;
  const setRow = (i, patch) => setRows((p) => p.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const saveBornes = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateCadastreLot(lotId, {
        projet: lot.projet || null,
        prestation: lot.prestation || null,
        titreFoncier: lot.titreFoncier,
        proprieteDite: lot.proprieteDite,
        lotNumber: lot.lotNumber,
        affaireRef: lot.affaireRef,
        geometre: lot.geometre,
        dateLeve: lot.dateLeve,
        serviceCadastre: lot.serviceCadastre,
        zone: lot.zone,
        surfaceDocumentM2: lot.surfaceDocumentM2,
        correctionLambertM2: lot.correctionLambertM2,
        bornes: rows.map((r, i) => ({ name: r.name, sequence: i, x: Number(r.x), y: Number(r.y) })),
        distanceChecks: lot.distanceChecks.map((d) => ({ segmentLabel: d.segmentLabel, croquisM: d.croquisM })),
        referencePoints: lot.referencePoints.map((r) => ({ label: r.label, lat: r.lat, lng: r.lng })),
      });
      await load();
      changed.current = true;
      onChanged?.();
      notifySuccess("Bornes enregistrées — le lot repasse en brouillon");
    } catch (e) {
      setError(readApiError(e, "Échec de l'enregistrement des bornes."));
    } finally {
      setSaving(false);
    }
  };

  // ---- dragging bornes on the map -----------------------------------------------------------------------------
  const bornePoints = useMemo(
    () => rows.map((r, i) => (pts[i] ? { i, name: r.name, lat: pts[i].lat, lng: pts[i].lng } : null)).filter(Boolean),
    [rows, pts],
  );

  const roundM = (v) => Math.round(v * 100) / 100; // centimetres are plenty for a hand-corrected borne
  const onBorneDrag = useCallback((i, lat, lng) => {
    const from = pts[i];
    if (!from) return;
    const dLat = (lat - from.lat) * 111320;
    const dLng = (lng - from.lng) * 111320 * Math.cos((lat * Math.PI) / 180);
    setDragged({ i, meters: Math.hypot(dLat, dLng) });
  }, [pts]);

  const onBorneDrop = useCallback(async (i, lat, lng) => {
    setDragged(null);
    setPts((p) => p.map((q, k) => (k === i ? { lat, lng } : q)));
    try {
      const xy = await convertLotPoint(lotId, { lat, lng });
      setRows((p) => p.map((r, k) => (k === i ? { ...r, x: roundM(xy.x), y: roundM(xy.y) } : r)));
    } catch {
      notifyError("Impossible de convertir la position de la borne.");
    }
  }, [lotId]);

  // A typed X/Y moves the borne's handle too.
  const syncHandle = async (i) => {
    const r = rows[i];
    const x = Number(r?.x);
    const y = Number(r?.y);
    if (!r || !Number.isFinite(x) || !Number.isFinite(y)) return;
    try {
      const pos = await convertLotPoint(lotId, { x, y });
      setPts((p) => {
        const next = [...p];
        next[i] = { lat: pos.lat, lng: pos.lng };
        return next;
      });
    } catch {
      /* keep the previous handle position */
    }
  };

  // ---- review + placement -------------------------------------------------------------------------------
  const changeStatut = async (statut) => {
    setStatutBusy(true);
    setError(null);
    try {
      const u = await setLotStatut(lotId, statut);
      setLot((l) => ({ ...l, statut: u.statut, statutAt: u.statut_at, statutParName: u.statut_par_name || "" }));
      changed.current = true;
      onChanged?.();
    } catch (e) {
      setError(readApiError(e, "Changement de statut refusé."));
    } finally {
      setStatutBusy(false);
    }
  };

  // ---- checking the bornes against the total printed on the sheet ----------------------------------------------------
  const runCheck = async () => {
    const value = Number(String(check.value).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    setCheck((c) => ({ ...c, busy: true, result: null }));
    try {
      const result = await checkLotChecksum({ bornes: rows.map((r) => ({ name: r.name, x: Number(r.x), y: Number(r.y) })), [check.kind === "s" ? "s" : "two_s"]: value });
      setCheck((c) => ({ ...c, busy: false, result }));
    } catch (e) {
      setCheck((c) => ({ ...c, busy: false, result: { error: readApiError(e, "Vérification impossible.") } }));
    }
  };
  const applySuggestion = (sg) => {
    setRows((p) => p.map((r, k) => (k === sg.index ? { ...r, [sg.axis]: sg.to } : r)));
    setTimeout(() => syncHandle(sg.index), 0);
    setCheck((c) => ({ ...c, result: null }));
  };

  // ---- moving / turning the whole lot ---------------------------------------------------------------------------
  const toggleXform = () => {
    if (xform) {
      setXform(null);
      setXLive(null);
      return;
    }
    if (bornePoints.length < 3) return;
    const ring = bornePoints.map((p) => [p.lng, p.lat]);
    setEditBornes(false);
    setXform({ base: ring, lat: ring.reduce((s, p) => s + p[1], 0) / ring.length, lng: ring.reduce((s, p) => s + p[0], 0) / ring.length, deg: 0 });
  };
  // The rotation field shows the lot's total turn; the map works in the turn added on top of it.
  const setAngle = (total) => setXform((x) => x && { ...x, deg: Math.round((((total - lot.rotationDeg) + 540) % 360 - 180) * 10) / 10 });
  const applyXform = () => reposition({ lat: xform.lat, lng: xform.lng, rotation_deg: lot.rotationDeg + xform.deg });

  const reposition = async (body) => {
    setPlaceBusy(true);
    setError(null);
    try {
      await repositionCadastreLot(lotId, body);
      await load();
      setXform(null);
      setXLive(null);
      changed.current = true;
      onChanged?.();
      notifySuccess(body.reset ? "Position du document rétablie" : "Lot déplacé et orienté sur la carte");
    } catch (e) {
      setError(readApiError(e, "Repositionnement refusé."));
      notifyError("Repositionnement refusé.");
    } finally {
      setPlaceBusy(false);
    }
  };

  const panes = ["plan", "map", "bornes"].filter((k) => show[k]);
  const rightPanes = panes.filter((k) => k !== "plan");
  const toggle = (k) => setShow((s) => (s[k] && panes.length === 1 ? s : { ...s, [k]: !s[k] }));

  if (error && !lot) {
    return (
      <div className="lw" role="dialog" aria-modal="true">
        <div className="lw-fatal">
          <div className="cad-error" role="alert">{error}</div>
          <button className="cad-btn" onClick={() => onClose(false)}><X size={16} /> Fermer</button>
        </div>
      </div>
    );
  }
  if (!lot) return <div className="lw" role="dialog" aria-modal="true"><div className="lw-fatal"><Loader2 size={24} className="gt-spin-icon" /></div></div>;

  const mapBlock = (
    <section className="lw-pane lw-map" style={rightPanes.length > 1 ? { flex: `0 0 ${layout.map * 100}%` } : { flex: 1 }}>
      <header className="lw-panehead">
        <h2><MapIcon size={14} /> Carte</h2>
        <div className="lw-panetools">
          {lot.positionApproximative && !xform && (
            <button type="button" className="lw-chip is-warn" disabled={placeBusy} onClick={() => reposition({ reset: true })} title="Revenir aux coordonnées du document">
              <Undo2 size={13} /> Position approximative — rétablir
            </button>
          )}
          <button type="button" className={`lw-chip${editBornes ? " is-on" : ""}`} onClick={() => { setEditBornes((v) => !v); setXform(null); setXLive(null); }} aria-pressed={editBornes} title="Glisser les bornes sur la carte pour les corriger"><Move size={13} /> Corriger les bornes</button>
          <button type="button" className={`lw-chip${satellite ? " is-on" : ""}`} onClick={() => setSatellite((v) => !v)}><Layers size={13} /> Satellite</button>
          <button type="button" className={`lw-chip${xform ? " is-on" : ""}`} onClick={toggleXform} aria-pressed={Boolean(xform)} title="Déplacer et pivoter tout le lot sur la carte"><MapPin size={13} /> Déplacer / pivoter</button>
        </div>
      </header>
      {xform && (
        <div className="lw-xbar" role="group" aria-label="Déplacer et pivoter le lot">
          <p>Glissez <b>✥</b> pour déplacer le lot, la poignée <b>↻</b> pour le pivoter — ou cliquez sur la carte pour placer son centre.</p>
          <div className="lw-xrow">
            <label className="lw-xangle">
              Rotation
              <input type="number" step="0.1" value={Math.round(((lot.rotationDeg + (xLive ?? xform).deg) * 10)) / 10} onChange={(e) => setAngle(Number(e.target.value))} aria-label="Rotation en degrés" />
              <span>°</span>
            </label>
            {[-5, -1, 1, 5].map((d) => <button key={d} type="button" className="lw-btn" onClick={() => setAngle(lot.rotationDeg + xform.deg + d)}>{d > 0 ? "+" : "−"}{Math.abs(d)}°</button>)}
            <button type="button" className="lw-btn" onClick={() => setAngle(0)} title="Orientation du document">0°</button>
            <span className="lw-xspacer" />
            <button type="button" className="lw-btn primary" disabled={placeBusy} onClick={applyXform}>
              {placeBusy ? <Loader2 size={14} className="gt-spin-icon" /> : <CheckCircle2 size={14} />} Appliquer
            </button>
            <button type="button" className="lw-btn" onClick={() => { setXform(null); setXLive(null); }}>Annuler</button>
          </div>
        </div>
      )}
      {editBornes && (
        <div className="lw-editbar" role="status">
          <Move size={14} />
          <span>{dragged ? <>Déplacement de la borne <b>{rows[dragged.i]?.name || dragged.i + 1}</b> · <b>{dragged.meters.toFixed(2)} m</b></> : "Glissez une borne pour la corriger : le tableau et la surface se mettent à jour."}</span>
          {dirty && <em>{rows.length} bornes · à enregistrer</em>}
        </div>
      )}
      <div className="lw-mapbox">
        <LotMap geojson={geojson} focusName={focusBorne} satellite={satellite}
          bornePoints={bornePoints} editable={editBornes && !xform} onBorneDrag={onBorneDrag} onBorneDrop={onBorneDrop}
          transformMode={Boolean(xform)} transformBase={xform?.base} transform={xform && { lat: xform.lat, lng: xform.lng, deg: xform.deg }}
          onTransformChange={(t) => { setXform((x) => x && { ...x, lat: t.lat, lng: t.lng, deg: t.deg }); setXLive(null); }} onTransformLive={setXLive} />
      </div>
    </section>
  );

  const bornesBlock = (
    <section className="lw-pane lw-bornes" style={{ flex: 1 }}>
      <header className="lw-panehead">
        <h2><Rows3 size={14} /> Bornes · {rows.length}</h2>
        <div className="lw-panetools">
          <button type="button" className={`lw-chip${check.open ? " is-on" : ""}`} onClick={() => setCheck((c) => ({ ...c, open: !c.open }))} title="Comparer les bornes au total imprimé sur la feuille" aria-pressed={check.open}><ShieldCheck size={13} /> Vérifier</button>
          <button type="button" className="lw-chip" onClick={() => { setRows((p) => [...p, { name: "", x: 0, y: 0 }]); setPts((p) => [...p, null]); }}><Plus size={13} /> Ajouter</button>
          <button type="button" className="lw-chip" disabled={!dirty || saving} onClick={() => { setRows(original); setPts(lot.bornes.map((b) => ({ lat: b.lat, lng: b.lng }))); }}><Undo2 size={13} /> Annuler</button>
          <button type="button" className="lw-btn primary" disabled={!dirty || saving || rows.length < 3} onClick={saveBornes}>
            {saving ? <Loader2 size={14} className="gt-spin-icon" /> : <Save size={14} />} Enregistrer
          </button>
        </div>
      </header>
      {dirty && (
        <div className="lw-live">
          <span>Aperçu</span>
          <strong>{area == null ? "—" : `${fmt(area)} m²`}</strong>
          <span>écart</span>
          <strong className={conforme ? "ok" : "bad"}>{ecart == null ? "—" : `${ecart > 0 ? "+" : ""}${fmt(ecart)} m²`}</strong>
          <small>Enregistrer remet le lot en brouillon.</small>
        </div>
      )}
      {check.open && (
        <div className="lw-check">
          <p>Saisissez le total imprimé sur la feuille : les bornes doivent le reproduire. S'il manque, l'app cherche le chiffre mal lu.</p>
          <div className="lw-checkrow">
            <select value={check.kind} onChange={(e) => setCheck((c) => ({ ...c, kind: e.target.value, result: null }))} aria-label="Type de total">
              <option value="s">S =</option>
              <option value="two_s">2 S =</option>
            </select>
            <input inputMode="decimal" placeholder="ex. 314379,45" value={check.value} onChange={(e) => setCheck((c) => ({ ...c, value: e.target.value, result: null }))} onKeyDown={(e) => e.key === "Enter" && runCheck()} />
            <span>m²</span>
            <button type="button" className="lw-btn primary" disabled={check.busy || !check.value} onClick={runCheck}>{check.busy ? <Loader2 size={14} className="gt-spin-icon" /> : <ShieldCheck size={14} />} Vérifier</button>
          </div>
          {check.result?.error && <div className="lw-checkres is-bad">{check.result.error}</div>}
          {check.result && !check.result.error && (check.result.ok ? (
            <div className="lw-checkres is-ok"><CheckCircle2 size={14} /> Les bornes reproduisent le total de la feuille (écart {fmt(check.result.ecart, 4)} sur 2S). Les coordonnées sont bonnes.</div>
          ) : (
            <div className="lw-checkres is-bad">
              <AlertTriangle size={14} />
              <div>
                Écart de <b>{fmt(check.result.ecart, 2)}</b> sur 2S : une valeur est mal lue.
                {check.result.suggestions.length === 0 && " Aucune correction à un seul chiffre ne l'explique : plusieurs valeurs sont à revoir sur la feuille."}
                {check.result.suggestions.map((sg) => (
                  <div key={`${sg.index}${sg.axis}${sg.to}`} className="lw-sugg">
                    <span><b>{sg.name}</b> · {sg.axis.toUpperCase()} · <s>{fmt(sg.from, 2)}</s> → <b>{fmt(sg.to, 2)}</b></span>
                    <button type="button" className="lw-btn" onClick={() => applySuggestion(sg)}>Appliquer</button>
                  </div>
                ))}
                {check.result.suggestions.length > 1 && <small>Plusieurs lectures reproduisent le total : vérifiez sur le plan laquelle est la bonne.</small>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="lw-tablewrap">
        <table className="lw-table">
          <thead><tr><th>Borne</th><th>X Lambert</th><th>Y Lambert</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const edited = original[i] && (r.name !== original[i].name || Number(r.x) !== Number(original[i].x) || Number(r.y) !== Number(original[i].y));
              return (
                <tr key={i} className={`${focusBorne === r.name && r.name ? "is-focused" : ""}${edited || !original[i] ? " is-edited" : ""}`} onClick={() => setFocusBorne((f) => (f === r.name ? null : r.name))}>
                  <td><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} aria-label={`Nom de la borne ${i + 1}`} onClick={(e) => e.stopPropagation()} /></td>
                  <td><input type="number" step="0.01" value={r.x} onChange={(e) => setRow(i, { x: e.target.value })} aria-label={`X de ${r.name || i + 1}`} onClick={(e) => e.stopPropagation()} onBlur={() => syncHandle(i)} /></td>
                  <td><input type="number" step="0.01" value={r.y} onChange={(e) => setRow(i, { y: e.target.value })} aria-label={`Y de ${r.name || i + 1}`} onClick={(e) => e.stopPropagation()} onBlur={() => syncHandle(i)} /></td>
                  <td>
                    <button type="button" className="lw-icon" onClick={(e) => { e.stopPropagation(); setRows((p) => p.filter((_, k) => k !== i)); setPts((p) => p.filter((_, k) => k !== i)); }} aria-label={`Supprimer la borne ${r.name || i + 1}`}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="lw" role="dialog" aria-modal="true" aria-label={`Contrôle du lot ${lot.titreFoncier}`}>
      <header className="lw-top">
        <button type="button" className="lw-icon" onClick={close} aria-label="Fermer (Échap)" title="Fermer (Échap)"><X size={18} /></button>
        <div className="lw-title">
          <span className="lw-eyebrow">Titre foncier {lot.titreFoncier}</span>
          <strong>{lot.proprieteDite}</strong>
        </div>

        <div className="lw-figures" aria-label="Surface">
          <div><span>Calculée</span><strong>{fmt(area ?? lot.surfaceCalculeeM2)} m²</strong></div>
          <div><span>Document</span><strong>{fmt(lot.surfaceDocumentM2)} m²</strong></div>
          <div className={!lot.surfaceVerifiable ? "" : dirty ? (conforme ? "ok" : "bad") : lot.conforme ? "ok" : "bad"}>
            <span>Écart</span>
            <strong>{!lot.surfaceVerifiable ? "non vérifiable" : (() => { const v = dirty ? ecart : lot.surfaceCalculeeM2 + lot.correctionLambertM2 + lot.ajustementsM2 - lot.surfaceDocumentM2; return v == null ? "—" : `${v > 0 ? "+" : ""}${fmt(v)} m²`; })()}</strong>
          </div>
        </div>

        <div className="lw-spacer" />

        <div className="lw-viewtoggle" role="group" aria-label="Panneaux affichés">
          <button type="button" className={show.plan ? "is-on" : ""} onClick={() => toggle("plan")}><ScanLine size={13} /> Plan</button>
          <button type="button" className={show.map ? "is-on" : ""} onClick={() => toggle("map")}><MapIcon size={13} /> Carte</button>
          <button type="button" className={show.bornes ? "is-on" : ""} onClick={() => toggle("bornes")}><Rows3 size={13} /> Bornes</button>
        </div>

        <div className="lw-review">
          <span className={`lw-statut is-${lot.statut}`}>{STATUT_LABEL[lot.statut]}</span>
          {lot.statut === "brouillon" && <button type="button" className="lw-btn" disabled={statutBusy} onClick={() => changeStatut("verifie")}>Marquer vérifié</button>}
          {lot.statut === "verifie" && <button type="button" className="lw-btn primary" disabled={statutBusy} onClick={() => changeStatut("valide")}>Valider</button>}
          {lot.statut !== "brouillon" && <button type="button" className="lw-btn" disabled={statutBusy} onClick={() => changeStatut("brouillon")}>Brouillon</button>}
        </div>
        <button type="button" className="lw-icon" onClick={toggleFullscreen} aria-label="Plein écran du navigateur" title="Plein écran du navigateur">
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </header>

      {error && <div className="lw-error" role="alert"><AlertTriangle size={14} /> {error}</div>}

      <div className="lw-body" ref={bodyRef}>
        {show.plan && (
          <section className="lw-pane lw-planpane" style={rightPanes.length ? { flex: `0 0 ${layout.plan * 100}%` } : { flex: 1 }}>
            <PlanAnnotator lotId={lotId} hasPlan={Boolean(lot.sourcePdfUrl)} annotations={annotations} onChange={onAnnotate} saveState={saveState} />
          </section>
        )}
        {show.plan && rightPanes.length > 0 && <div className="lw-split is-v" onPointerDown={startDrag("plan")} role="separator" aria-orientation="vertical" />}
        {rightPanes.length > 0 && (
          <div className="lw-right" ref={rightRef}>
            {show.map && mapBlock}
            {show.map && show.bornes && <div className="lw-split is-h" onPointerDown={startDrag("map")} role="separator" aria-orientation="horizontal" />}
            {show.bornes && bornesBlock}
          </div>
        )}
      </div>
    </div>
  );
}
