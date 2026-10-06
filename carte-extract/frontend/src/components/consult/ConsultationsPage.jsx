import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Layers, Loader2, Trash2, Upload } from "lucide-react";
import { saveBlob } from "../../utils/saveBlob";
import { consultBatch, createLayer, deleteLayer, errorText, getHistory, getLayers, getNotifications, historyCsv, markNotificationsRead, scanNotifications } from "./consultApi";
import "../../styles/consult.css";

const KIND = { position: "Position", parcelle: "Parcelle / fichier", titre: "Titre foncier", lot: "Lot par lot", pres: "Près de moi", batch: "Traitement par lot" };
const VERDICT = { ok: "OK", warning: "À vérifier", danger: "Déjà livré" };
const fmtDate = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function History({ office }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("mine");
  useEffect(() => {
    const t = setTimeout(() => getHistory(q).then((r) => { setRows(r.results); setScope(r.scope); }).catch(() => setRows([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="cp-card">
      <h3>Historique des consultations</h3>
      <p>{scope === "all" ? "Qui a cherché quoi, et quand — toute l'équipe." : "Vos consultations."}</p>
      <div className="cp-bar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un titre, un fichier, un utilisateur…" style={{ flex: 1, minWidth: 220 }} />
        <button type="button" className="cs-btn" onClick={async () => saveBlob(await historyCsv(), "Historique-consultations.csv")}><Download size={14} /> Export CSV</button>
      </div>
      {rows === null ? <div className="cp-empty"><Loader2 size={16} className="cs-spin" /></div> : rows.length === 0 ? <div className="cp-empty">Aucune consultation pour le moment. Utilisez « Consulter » sur la Carte.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="cp-table">
            <thead><tr><th>Date</th>{office && <th>Utilisateur</th>}<th>Type</th><th>Recherche</th><th>Projets</th><th>Verdict</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  {office && <td>{r.username}</td>}
                  <td>{KIND[r.kind] || r.kind}</td>
                  <td><b>{r.label || "—"}</b>{r.titre && <div style={{ color: "var(--muted)", fontSize: 12 }}>Titre {r.titre}</div>}{r.source_file && <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.source_file}</div>}</td>
                  <td>{r.n_found}{r.radius_m ? <span style={{ color: "var(--muted)" }}> / {r.radius_m} m</span> : null}</td>
                  <td><span className={`cp-pill is-${r.status}`}>{VERDICT[r.status] || r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Batch() {
  const [file, setFile] = useState(null);
  const [radius, setRadius] = useState(200);
  const [zone, setZone] = useState("nord");
  const [mode, setMode] = useState("points");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const ref = useRef(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("radius", String(radius));
      form.append("zone", zone);
      form.append("mode", mode);
      saveBlob(await consultBatch(form), "Consultation-par-lot.xlsx");
      setMsg({ ok: true, text: "Fichier Excel généré : un onglet par parcelle consultée, avec les projets les plus proches." });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, "Traitement impossible.") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cp-card">
      <h3>Traitement par lot</h3>
      <p>Déposez une liste de parcelles (CSV, Excel, KML, GeoJSON, GPX) : vous obtenez un Excel avec, pour chacune, les projets les plus proches, les chevauchements et un verdict. Jusqu'à 500 parcelles.</p>
      <div className="cp-bar">
        <button type="button" className="cs-btn" onClick={() => ref.current?.click()}><Upload size={14} /> {file ? file.name : "Choisir un fichier"}</button>
        <input ref={ref} type="file" hidden accept=".csv,.txt,.tsv,.xlsx,.kml,.geojson,.json,.gpx" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
        <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Contenu du fichier"><option value="points">Chaque ligne = un point</option><option value="auto">Bornes groupées par parcelle</option></select>
        <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone Lambert"><option value="nord">Lambert Nord</option><option value="sud">Lambert Sud</option></select>
        <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Rayon">{[100, 200, 500, 1000].map((r) => <option key={r} value={r}>Rayon {r} m</option>)}</select>
        <button type="button" className="cs-go" disabled={!file || busy} onClick={run}>{busy ? <Loader2 size={14} className="cs-spin" /> : <FileSpreadsheet size={14} />} Générer l'Excel</button>
      </div>
      {msg && <div className={msg.ok ? "cs-verdict is-ok" : "cs-error"} role="status">{msg.text}</div>}
      <p style={{ fontSize: 12 }}>Colonnes reconnues : <i>borne ; X ; Y</i> (Lambert) ou <i>latitude ; longitude</i>, et facultativement <i>parcelle</i> / <i>titre</i> pour grouper les bornes d'une même parcelle.</p>
    </div>
  );
}

function Layers_({ office }) {
  const [layers, setLayers] = useState(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [zone, setZone] = useState("nord");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(null);
  const load = useCallback(() => getLayers().then((r) => setLayers(r.results)).catch(() => setLayers([])), []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      if (file) form.append("file", file); else form.append("text", text);
      form.append("name", name || file?.name || "Parcelles voisines");
      form.append("zone", zone);
      await createLayer(form);
      setName(""); setText(""); setFile(null);
      load();
    } catch (e) {
      setError(errorText(e, "Import impossible."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cp-card">
      <h3>Couches de référence</h3>
      <p>Les parcelles voisines tirées des extraits cadastraux (par exemple T96988/03, T98526/03) servent de repères : elles apparaissent en mauve sur la Carte et dans chaque consultation, sans être des projets.</p>
      {layers === null ? <div className="cp-empty"><Loader2 size={16} className="cs-spin" /></div> : layers.length === 0 ? <div className="cp-empty">Aucune couche importée.</div> : (
        <table className="cp-table">
          <thead><tr><th>Couche</th><th>Parcelles</th><th>Importée le</th><th /></tr></thead>
          <tbody>
            {layers.map((l) => (
              <tr key={l.id}>
                <td><Layers size={13} style={{ verticalAlign: -2, color: "#7a5aa6" }} /> <b>{l.name}</b></td>
                <td>{l.count}</td>
                <td>{fmtDate(l.created_at)}</td>
                <td style={{ textAlign: "right" }}>{office && <button type="button" className="cs-link" aria-label="Supprimer la couche" onClick={async () => { await deleteLayer(l.id); load(); }}><Trash2 size={14} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {office && (
        <div className="cs-form">
          <h4 style={{ margin: "6px 0 0" }}>Ajouter une couche</h4>
          <div className="cs-grid">
            <label>Nom<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Voisins de T98525/03" /></label>
            <label>Coordonnées<select value={zone} onChange={(e) => setZone(e.target.value)}><option value="nord">Lambert Nord</option><option value="sud">Lambert Sud</option></select></label>
          </div>
          <textarea rows={4} value={text} onChange={(e) => { setText(e.target.value); setFile(null); }} placeholder={"Collez les bornes de la mappe cadastrale : B14 X : 369020.33 Y : 371666.77 …"} />
          <div className="cp-bar">
            <button type="button" className="cs-btn" onClick={() => ref.current?.click()}><Upload size={14} /> {file ? file.name : "ou un fichier"}</button>
            <input ref={ref} type="file" hidden accept=".csv,.txt,.tsv,.xlsx,.kml,.geojson,.json,.gpx" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
            <button type="button" className="cs-go" disabled={busy || (!file && !text.trim())} onClick={add}>{busy ? <Loader2 size={14} className="cs-spin" /> : <Upload size={14} />} Importer</button>
          </div>
          {error && <div className="cs-error">{error}</div>}
        </div>
      )}
    </div>
  );
}

function Alerts({ office }) {
  const [items, setItems] = useState(null);
  const [info, setInfo] = useState("");
  const load = useCallback(() => getNotifications().then((r) => setItems(r.results)).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="cp-card">
      <h3>Alertes de proximité</h3>
      <p>Quand un projet est localisé près d'un projet existant, l'équipe est prévenue : « un projet existe déjà à 80 m ».</p>
      <div className="cp-bar">
        <button type="button" className="cs-btn" onClick={async () => { await markNotificationsRead(); load(); }}>Tout marquer comme lu</button>
        {office && <button type="button" className="cs-btn" onClick={async () => { const r = await scanNotifications(); setInfo(`${r.created} nouvelle(s) alerte(s).`); load(); }}>Analyser les projets récents</button>}
        {info && <span style={{ color: "var(--muted)", fontSize: 13 }}>{info}</span>}
      </div>
      {items === null ? <div className="cp-empty"><Loader2 size={16} className="cs-spin" /></div> : items.length === 0 ? <div className="cp-empty">Aucune alerte.</div> : items.map((n) => (
        <div key={n.id} className={`cp-notif is-${n.severity}${n.read ? " is-read" : ""}`}>
          <div><b>{n.title}</b><div style={{ color: "var(--muted)", fontSize: 12.5 }}>{n.message}</div><div style={{ color: "var(--muted)", fontSize: 11 }}>{fmtDate(n.created_at)} · {n.projet_id}</div></div>
        </div>
      ))}
    </div>
  );
}

export default function ConsultationsPage({ isOffice }) {
  const [tab, setTab] = useState("historique");
  return (
    <div className="cp">
      <div className="cp-tabs" role="tablist">
        {[["historique", "Historique"], ["lot", "Traitement par lot"], ["couches", "Couches de référence"], ["alertes", "Alertes"]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === "historique" && <History office={isOffice} />}
      {tab === "lot" && <Batch />}
      {tab === "couches" && <Layers_ office={isOffice} />}
      {tab === "alertes" && <Alerts office={isOffice} />}
    </div>
  );
}
