import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, Eraser, Hand, Loader2, MapPin, Maximize, MousePointer2, Pencil, Redo2, Square, Type, Undo2, ZoomIn, ZoomOut,
} from "lucide-react";
import { getLotPlanImage, getLotPlanInfo } from "./api";

// Marks live in normalized plan coordinates (0..1 of the page width/height) and stroke sizes are in
// "units per 1000 px of width", so they line up at any zoom and at any render resolution.
const COLORS = ["#b3261e", "#1f6f68", "#c77700", "#2f5fd0", "#111111"];
const TOOLS = [
  { key: "pan", label: "Déplacer", hint: "H", icon: Hand },
  { key: "select", label: "Sélectionner", hint: "V", icon: MousePointer2 },
  { key: "pen", label: "Crayon", hint: "P", icon: Pencil },
  { key: "rect", label: "Cadre", hint: "R", icon: Square },
  { key: "arrow", label: "Flèche", hint: "A", icon: ArrowUpRight },
  { key: "text", label: "Texte", hint: "T", icon: Type },
  { key: "pin", label: "Repère numéroté", hint: "N", icon: MapPin },
];
const MIN_SCALE = 0.1;
const MAX_SCALE = 12;
const newId = () => Math.random().toString(36).slice(2, 10);

function bboxOf(a) {
  if (a.type === "pen") {
    const xs = a.points.map((p) => p[0]);
    const ys = a.points.map((p) => p[1]);
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  }
  if (a.type === "rect") return { x1: a.x, y1: a.y, x2: a.x + a.w, y2: a.y + a.h };
  if (a.type === "arrow") return { x1: Math.min(a.x1, a.x2), y1: Math.min(a.y1, a.y2), x2: Math.max(a.x1, a.x2), y2: Math.max(a.y1, a.y2) };
  return { x1: a.x, y1: a.y, x2: a.x, y2: a.y };
}

/** Plan page with zoom/pan and drawing tools. `annotations` is controlled; every change goes to `onChange`. */
export default function PlanAnnotator({ lotId, hasPlan, annotations, onChange, saveState }) {
  const wrapRef = useRef(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [hd, setHd] = useState(false);
  const [img, setImg] = useState({ url: null, w: 0, h: 0, loading: true, error: false });
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [tool, setTool] = useState("pan");
  const [color, setColor] = useState(COLORS[0]);
  const [weight, setWeight] = useState(3);
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null); // text/pin being typed: { kind, x, y, text }
  const [undo, setUndo] = useState([]);
  const [redo, setRedo] = useState([]);
  const drag = useRef(null);
  const spaceDown = useRef(false);

  const list = useMemo(() => annotations.filter((a) => (a.page || 1) === page), [annotations, page]);

  const commit = useCallback((next) => {
    setUndo((u) => [...u.slice(-49), annotations]);
    setRedo([]);
    onChange(next);
  }, [annotations, onChange]);

  // ---- image loading -------------------------------------------------------------------------
  useEffect(() => {
    if (!hasPlan) {
      setImg({ url: null, w: 0, h: 0, loading: false, error: false });
      return undefined;
    }
    getLotPlanInfo(lotId).then((i) => setPages(Math.max(1, i.pages))).catch(() => {});
    return undefined;
  }, [lotId, hasPlan]);

  useEffect(() => {
    if (!hasPlan) return undefined;
    let cancelled = false;
    let url = null;
    setImg((p) => ({ ...p, loading: true, error: false }));
    getLotPlanImage(lotId, page, hd ? 210 : 130)
      .then((u) => {
        url = u;
        const probe = new Image();
        probe.onload = () => !cancelled && setImg({ url: u, w: probe.naturalWidth, h: probe.naturalHeight, loading: false, error: false });
        probe.onerror = () => !cancelled && setImg({ url: null, w: 0, h: 0, loading: false, error: true });
        probe.src = u;
      })
      .catch(() => !cancelled && setImg({ url: null, w: 0, h: 0, loading: false, error: true }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [lotId, page, hd, hasPlan]);

  const fit = useCallback(() => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || !img.w) return;
    const s = Math.min(box.width / img.w, box.height / img.h) * 0.96;
    setView({ s, x: (box.width - img.w * s) / 2, y: (box.height - img.h * s) / 2 });
  }, [img.w, img.h]);
  useEffect(fit, [fit]);

  const zoomAt = (factor, cx, cy) =>
    setView((v) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
      const k = s / v.s;
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  const zoomCenter = (factor) => {
    const box = wrapRef.current.getBoundingClientRect();
    zoomAt(factor, box.width / 2, box.height / 2);
  };

  // Wheel needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // client -> normalized plan coordinates
  const toPlan = (e) => {
    const box = wrapRef.current.getBoundingClientRect();
    return [(e.clientX - box.left - view.x) / view.s / img.w, (e.clientY - box.top - view.y) / view.s / img.h];
  };

  // ---- pointer handling ------------------------------------------------------------------------
  const onPointerDown = (e) => {
    if (!img.url || editor) return;
    const panning = tool === "pan" || spaceDown.current || e.button === 1;
    wrapRef.current.setPointerCapture(e.pointerId);
    if (panning) {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    const [x, y] = toPlan(e);
    if (tool === "select") {
      const hit = [...list].reverse().find((a) => {
        const b = bboxOf(a);
        const pad = 0.012;
        return x >= b.x1 - pad && x <= b.x2 + pad && y >= b.y1 - pad && y <= b.y2 + pad;
      });
      setSelected(hit ? hit.id : null);
      return;
    }
    if (tool === "text" || tool === "pin") {
      setEditor({ kind: tool, x, y, text: "" });
      return;
    }
    drag.current = { kind: "draw", start: [x, y] };
    if (tool === "pen") setDraft({ type: "pen", points: [[x, y]], color, width: weight });
    if (tool === "rect") setDraft({ type: "rect", x, y, w: 0, h: 0, color, width: weight });
    if (tool === "arrow") setDraft({ type: "arrow", x1: x, y1: y, x2: x, y2: y, color, width: weight });
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
      return;
    }
    const [x, y] = toPlan(e);
    setDraft((cur) => {
      if (!cur) return cur;
      if (cur.type === "pen") {
        const last = cur.points[cur.points.length - 1];
        return Math.hypot((x - last[0]) * img.w, (y - last[1]) * img.h) < 2 ? cur : { ...cur, points: [...cur.points, [x, y]] };
      }
      if (cur.type === "rect") return { ...cur, x: Math.min(d.start[0], x), y: Math.min(d.start[1], y), w: Math.abs(x - d.start[0]), h: Math.abs(y - d.start[1]) };
      return { ...cur, x2: x, y2: y };
    });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== "draw" || !draft) return;
    const tiny =
      (draft.type === "pen" && draft.points.length < 2) ||
      (draft.type === "rect" && draft.w * img.w < 4 && draft.h * img.h < 4) ||
      (draft.type === "arrow" && Math.hypot((draft.x2 - draft.x1) * img.w, (draft.y2 - draft.y1) * img.h) < 6);
    if (!tiny) commit([...annotations, { ...draft, id: newId(), page }]);
    setDraft(null);
  };

  const submitEditor = () => {
    if (!editor) return;
    const text = editor.text.trim();
    if (text || editor.kind === "pin") {
      const n = editor.kind === "pin" ? annotations.filter((a) => a.type === "pin").length + 1 : undefined;
      commit([...annotations, { id: newId(), page, type: editor.kind, x: editor.x, y: editor.y, text, color, n, width: weight }]);
    }
    setEditor(null);
  };

  const removeSelected = useCallback(() => {
    if (!selected) return;
    commit(annotations.filter((a) => a.id !== selected));
    setSelected(null);
  }, [selected, annotations, commit]);

  const doUndo = () => {
    if (!undo.length) return;
    setRedo((r) => [...r, annotations]);
    onChange(undo[undo.length - 1]);
    setUndo((u) => u.slice(0, -1));
  };
  const doRedo = () => {
    if (!redo.length) return;
    setUndo((u) => [...u, annotations]);
    onChange(redo[redo.length - 1]);
    setRedo((r) => r.slice(0, -1));
  };

  // ---- keyboard --------------------------------------------------------------------------------
  useEffect(() => {
    const down = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.code === "Space" && !typing) {
        spaceDown.current = true;
        return;
      }
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") removeSelected();
      const t = TOOLS.find((x) => x.hint === e.key.toUpperCase());
      if (t && !mod) setTool(t.key);
      if (e.key === "+" || e.key === "=") zoomCenter(1.25);
      if (e.key === "-") zoomCenter(0.8);
      if (e.key === "0") fit();
    };
    const up = (e) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  // ---- rendering -------------------------------------------------------------------------------
  const unit = img.w / 1000;
  const px = (a, b) => [a * img.w, b * img.h];

  const renderMark = (a, isDraft = false) => {
    const sw = (a.width || 3) * unit;
    const isSel = a.id === selected;
    const common = { key: a.id || "draft", stroke: a.color, strokeWidth: sw, fill: "none", strokeLinecap: "round", strokeLinejoin: "round", opacity: isDraft ? 0.7 : 1 };
    let node = null;
    if (a.type === "pen") {
      node = <polyline {...common} points={a.points.map((p) => px(p[0], p[1]).join(",")).join(" ")} />;
    } else if (a.type === "rect") {
      const [x, y] = px(a.x, a.y);
      node = <rect {...common} x={x} y={y} width={a.w * img.w} height={a.h * img.h} rx={sw} fill={a.color} fillOpacity={0.06} />;
    } else if (a.type === "arrow") {
      const [x1, y1] = px(a.x1, a.y1);
      const [x2, y2] = px(a.x2, a.y2);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = sw * 5;
      const h1 = [x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45)];
      const h2 = [x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45)];
      node = (
        <g {...common} fill="none">
          <line x1={x1} y1={y1} x2={x2} y2={y2} />
          <polyline points={`${h1.join(",")} ${x2},${y2} ${h2.join(",")}`} />
        </g>
      );
    } else if (a.type === "text") {
      const [x, y] = px(a.x, a.y);
      const fs = 15 * unit * ((a.width || 3) / 3);
      node = (
        <text key={a.id} x={x} y={y} fill={a.color} fontSize={fs} fontFamily="Hanken Grotesk, sans-serif" fontWeight="600" stroke="#fff" strokeWidth={fs * 0.22} paintOrder="stroke">
          {a.text}
        </text>
      );
    } else if (a.type === "pin") {
      const [x, y] = px(a.x, a.y);
      const r = 11 * unit;
      node = (
        <g key={a.id}>
          <circle cx={x} cy={y} r={r} fill={a.color} stroke="#fff" strokeWidth={r * 0.18} />
          <text x={x} y={y + r * 0.36} textAnchor="middle" fill="#fff" fontSize={r * 1.05} fontWeight="700" fontFamily="IBM Plex Mono, monospace">{a.n}</text>
          {a.text && (
            <text x={x + r * 1.5} y={y + r * 0.36} fill={a.color} fontSize={r * 1.2} fontWeight="600" fontFamily="Hanken Grotesk, sans-serif" stroke="#fff" strokeWidth={r * 0.3} paintOrder="stroke">{a.text}</text>
          )}
        </g>
      );
    }
    if (isSel && node) {
      const b = bboxOf(a);
      const pad = 8 * unit;
      const [x1, y1] = px(b.x1, b.y1);
      const [x2, y2] = px(b.x2, b.y2);
      return (
        <g key={a.id}>
          {node}
          <rect x={x1 - pad} y={y1 - pad} width={x2 - x1 + pad * 2} height={y2 - y1 + pad * 2} fill="none" stroke="#2f5fd0" strokeWidth={1.5 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`} />
        </g>
      );
    }
    return node;
  };

  const cursor = tool === "pan" ? (drag.current?.kind === "pan" ? "grabbing" : "grab") : tool === "select" ? "default" : "crosshair";
  const pins = annotations.filter((a) => a.type === "pin" && (a.page || 1) === page);
  const editorPos = editor ? { left: editor.x * img.w * view.s + view.x, top: editor.y * img.h * view.s + view.y } : null;

  return (
    <div className="lw-plan">
      <div className="lw-toolbar" role="toolbar" aria-label="Outils d'annotation">
        <div className="lw-tools">
          {TOOLS.map((t) => (
            <button key={t.key} type="button" className={tool === t.key ? "is-on" : ""} onClick={() => setTool(t.key)} title={`${t.label} (${t.hint})`} aria-label={t.label} aria-pressed={tool === t.key}>
              <t.icon size={16} />
            </button>
          ))}
        </div>
        <div className="lw-swatches" role="group" aria-label="Couleur">
          {COLORS.map((c) => (
            <button key={c} type="button" className={color === c ? "is-on" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Couleur ${c}`} />
          ))}
        </div>
        <label className="lw-weight" title="Épaisseur">
          <input type="range" min="1" max="10" value={weight} onChange={(e) => setWeight(Number(e.target.value))} aria-label="Épaisseur du trait" />
        </label>
        <div className="lw-tools">
          <button type="button" onClick={doUndo} disabled={!undo.length} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Undo2 size={16} /></button>
          <button type="button" onClick={doRedo} disabled={!redo.length} title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir"><Redo2 size={16} /></button>
          <button type="button" onClick={removeSelected} disabled={!selected} title="Supprimer la sélection (Suppr)" aria-label="Supprimer la sélection"><Eraser size={16} /></button>
        </div>
        <div className="lw-tools">
          <button type="button" onClick={() => zoomCenter(0.8)} title="Zoom arrière (−)" aria-label="Zoom arrière"><ZoomOut size={16} /></button>
          <span className="lw-zoom">{Math.round(view.s * 100)}%</span>
          <button type="button" onClick={() => zoomCenter(1.25)} title="Zoom avant (+)" aria-label="Zoom avant"><ZoomIn size={16} /></button>
          <button type="button" onClick={fit} title="Ajuster (0)" aria-label="Ajuster à l'écran"><Maximize size={16} /></button>
        </div>
        <button type="button" className={`lw-chip${hd ? " is-on" : ""}`} onClick={() => setHd((v) => !v)} title="Rendu haute résolution pour lire les chiffres">HD</button>
        {pages > 1 && (
          <label className="lw-page">
            Page
            <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
              {Array.from({ length: pages }, (_, i) => <option key={i} value={i + 1}>{i + 1}/{pages}</option>)}
            </select>
          </label>
        )}
        <span className={`lw-save is-${saveState}`}>{saveState === "saving" ? "Enregistrement…" : saveState === "error" ? "Échec de l'enregistrement" : annotations.length ? "Annotations enregistrées" : ""}</span>
      </div>

      <div
        ref={wrapRef}
        className="lw-canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {!hasPlan && <div className="lw-empty"><strong>Aucun plan lié</strong>Ce lot n'a pas de fichier source enregistré.</div>}
        {hasPlan && img.loading && <div className="lw-empty"><Loader2 size={22} className="gt-spin-icon" />Chargement du plan…</div>}
        {hasPlan && img.error && <div className="lw-empty"><strong>Plan illisible</strong>Le fichier n'a pas pu être affiché.</div>}
        {img.url && (
          <div className="lw-stage" style={{ width: img.w, height: img.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
            <img src={img.url} alt="Plan source du lot" width={img.w} height={img.h} draggable={false} />
            <svg width={img.w} height={img.h} viewBox={`0 0 ${img.w} ${img.h}`}>
              {list.map((a) => renderMark(a))}
              {draft && renderMark(draft, true)}
            </svg>
          </div>
        )}
        {editor && (
          <form
            className="lw-editor"
            style={editorPos}
            onPointerDown={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); submitEditor(); }}
          >
            <input
              autoFocus
              value={editor.text}
              onChange={(e) => setEditor({ ...editor, text: e.target.value })}
              placeholder={editor.kind === "pin" ? "Commentaire (facultatif)" : "Texte de l'annotation"}
              onKeyDown={(e) => e.key === "Escape" && setEditor(null)}
            />
            <button type="submit">OK</button>
          </form>
        )}
      </div>

      {pins.length > 0 && (
        <ol className="lw-notes" aria-label="Repères">
          {pins.map((p) => (
            <li key={p.id} className={p.id === selected ? "is-on" : ""}>
              <button type="button" onClick={() => { setSelected(p.id); setTool("select"); }}>
                <i style={{ background: p.color }}>{p.n}</i>{p.text || "Sans commentaire"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
