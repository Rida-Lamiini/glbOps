import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Download, Loader2, Upload } from "lucide-react";
import { createCadastreLot, downloadExcelTemplate, parseExcelLots, readApiError } from "./api";

const fmt = (n, digits = 2) => (n == null ? "—" : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }));

const stateOf = (lot) => (lot.errors.length ? "error" : lot.warnings.length ? "warn" : "ok");

/**
 * Import of lots from an Excel workbook: pick the file, review what was read (errors block a lot, warnings do
 * not), then save the ticked lots. Lots are created as "brouillon" through the normal lot endpoint, so the
 * surface is recomputed server-side exactly as for a PDF import.
 */
export default function ExcelImportScreen({ onBack, onDone }) {
  const [stage, setStage] = useState("pick"); // pick | review | importing | done
  const [fileName, setFileName] = useState("");
  const [lots, setLots] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ ok: 0, failed: [] });
  const inputRef = useRef(null);

  const counts = useMemo(() => {
    const c = { ok: 0, warn: 0, error: 0 };
    lots.forEach((l) => { c[stateOf(l)] += 1; });
    return c;
  }, [lots]);

  const reset = () => {
    setStage("pick");
    setLots([]);
    setWarnings([]);
    setSelected(new Set());
    setFileName("");
    setError(null);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setError("Le fichier doit être un classeur Excel (.xlsx).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await parseExcelLots(file);
      setFileName(file.name);
      setLots(data.lots);
      setWarnings(data.warnings);
      setSelected(new Set(data.lots.filter((l) => l.errors.length === 0).map((l) => l.row)));
      setStage("review");
    } catch (e) {
      setError(readApiError(e, "Lecture impossible. Vérifiez que le fichier suit le modèle."));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (row) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  const importable = lots.filter((l) => l.errors.length === 0);
  const allTicked = importable.length > 0 && importable.every((l) => selected.has(l.row));
  const toggleAll = () => setSelected(allTicked ? new Set() : new Set(importable.map((l) => l.row)));

  const runImport = async () => {
    const todo = lots.filter((l) => selected.has(l.row) && l.errors.length === 0);
    setStage("importing");
    setProgress({ done: 0, total: todo.length });
    const failed = [];
    let ok = 0;
    for (const lot of todo) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await createCadastreLot({
          projet: lot.projet,
          prestation: lot.prestation,
          titreFoncier: lot.titre,
          proprieteDite: lot.propriete,
          lotNumber: lot.lotNumber,
          affaireRef: lot.affaireRef,
          geometre: lot.geometre,
          dateLeve: lot.dateLeve,
          serviceCadastre: lot.serviceCadastre,
          surfaceDocumentM2: lot.surfaceDocumentM2,
          correctionLambertM2: lot.correctionLambertM2,
          bornes: lot.bornes,
        });
        ok += 1;
      } catch (e) {
        failed.push({ titre: lot.titre, message: readApiError(e, "Échec de l'enregistrement.") });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setResult({ ok, failed });
    setStage("done");
  };

  return (
    <div className="cad">
      <button className="cad-btn" style={{ alignSelf: "flex-start" }} onClick={onBack}><ArrowLeft size={16} /> Retour</button>
      <header className="cad-hero">
        <div className="cad-eyebrow">Outils</div>
        <h1>Importer des lots depuis Excel</h1>
        <p>Un classeur avec une feuille « Lots » et une feuille « Bornes ». Vous relisez ce qui a été lu avant tout enregistrement ; les lots arrivent en brouillon.</p>
      </header>

      {stage === "pick" && (
        <section
          className={`cad-drop ${over ? "is-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files[0]); }}
        >
          <div>
            <h2>{busy ? "Lecture du fichier…" : "Déposez un fichier Excel (.xlsx)"}</h2>
            <p>Titre foncier, propriété dite et surface du document par lot ; nom et coordonnées Lambert (X, Y en mètres) par borne. Pas encore de fichier ? Téléchargez le modèle, il contient deux exemples et le mode d'emploi.</p>
            {error && <div className="cad-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          </div>
          <div className="cad-drop-actions">
            <label className="cad-btn primary">
              {busy ? <Loader2 size={16} className="gt-spin-icon" /> : <Upload size={16} />}
              {busy ? "Lecture en cours" : "Choisir un fichier"}
              <input ref={inputRef} type="file" accept=".xlsx" disabled={busy} onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <button className="cad-btn" onClick={() => downloadExcelTemplate().catch(() => setError("Le modèle n'a pas pu être téléchargé."))}>
              <Download size={16} /> Télécharger le modèle
            </button>
          </div>
        </section>
      )}

      {stage === "review" && (
        <>
          <section className="cad-panel">
            <div className="cad-top">
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><FileSpreadsheet size={18} /> {fileName}</h2>
              <div className="xl-summary">
                <span className="gt-status-pill neutral">{lots.length} lot{lots.length > 1 ? "s" : ""} lu{lots.length > 1 ? "s" : ""}</span>
                <span className="gt-status-pill success">{counts.ok + counts.warn} prêt{counts.ok + counts.warn > 1 ? "s" : ""}</span>
                {counts.warn > 0 && <span className="gt-status-pill warning">{counts.warn} avec avertissement</span>}
                {counts.error > 0 && <span className="gt-status-pill danger">{counts.error} bloqué{counts.error > 1 ? "s" : ""}</span>}
              </div>
            </div>
            {warnings.map((w) => <div key={w} className="cad-flag"><AlertTriangle size={14} /> {w}</div>)}
            <div className="xl-scroll">
              <table className="cad-bornes xl-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allTicked} onChange={toggleAll} disabled={importable.length === 0} aria-label="Tout sélectionner" /></th>
                    <th>Ligne</th><th>Titre foncier</th><th>Propriété dite</th><th>Bornes</th><th>Document</th><th>Calculée</th><th>Écart</th><th>Projet</th><th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => {
                    const st = stateOf(l);
                    return (
                      <tr key={l.row} className={st === "error" ? "is-error" : ""}>
                        <td><input type="checkbox" checked={selected.has(l.row)} disabled={st === "error"} onChange={() => toggle(l.row)} aria-label={`Importer ${l.titre}`} /></td>
                        <td data-label="Ligne">{l.row}</td>
                        <td data-label="Titre foncier"><strong>{l.titre || "—"}</strong></td>
                        <td data-label="Propriété dite">{l.propriete || "—"}</td>
                        <td data-label="Bornes">{l.bornes.length}</td>
                        <td data-label="Document" className="gt-mono">{l.surfaceDocumentM2 == null ? "—" : `${fmt(l.surfaceDocumentM2)} m²`}</td>
                        <td data-label="Calculée" className="gt-mono">{l.surfaceCalculeeM2 == null ? "—" : `${fmt(l.surfaceCalculeeM2)} m²`}</td>
                        <td data-label="Écart" className="gt-mono" style={{ color: l.conforme === false ? "var(--status-danger)" : undefined }}>
                          {l.ecartM2 == null ? "—" : `${l.ecartM2 > 0 ? "+" : ""}${fmt(l.ecartM2)} m²`}
                        </td>
                        <td data-label="Projet">{l.projet || "—"}</td>
                        <td data-label="État">
                          <span className={`gt-status-pill ${st === "error" ? "danger" : st === "warn" ? "warning" : "success"}`}>
                            <span className="gt-status-pill-dot" />{st === "error" ? "Bloqué" : st === "warn" ? "À vérifier" : "Prêt"}
                          </span>
                          {l.errors.map((m) => <div key={m} className="xl-msg is-error">{m}</div>)}
                          {l.warnings.map((m) => <div key={m} className="xl-msg is-warn">{m}</div>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <div className="xl-actions">
            <button className="cad-btn" onClick={reset}>Choisir un autre fichier</button>
            <button className="cad-btn primary" disabled={selected.size === 0} onClick={runImport}>
              <CheckCircle2 size={16} /> Importer {selected.size} lot{selected.size > 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}

      {stage === "importing" && (
        <section className="cad-panel" role="status">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={18} className="gt-spin-icon" /> Enregistrement…</h2>
          <div className="xl-progress"><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          <p className="cad-note">{progress.done} / {progress.total} lots</p>
        </section>
      )}

      {stage === "done" && (
        <section className="cad-panel" role="status">
          <div className={`cad-check ${result.failed.length ? "todo" : "ok"}`}>
            <i>{result.failed.length ? "!" : "✓"}</i>
            {result.ok} lot{result.ok > 1 ? "s" : ""} importé{result.ok > 1 ? "s" : ""} en brouillon
            {result.failed.length > 0 && ` — ${result.failed.length} en échec`}.
          </div>
          {result.failed.map((f) => <div key={f.titre} className="xl-msg is-error"><strong>{f.titre}</strong> : {f.message}</div>)}
          <div className="xl-actions">
            <button className="cad-btn" onClick={reset}>Importer un autre fichier</button>
            <button className="cad-btn primary" onClick={onDone}>Voir les lots</button>
          </div>
        </section>
      )}
    </div>
  );
}
