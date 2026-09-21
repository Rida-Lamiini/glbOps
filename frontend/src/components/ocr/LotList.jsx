import React, { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import ConformiteBadge from "./ConformiteBadge";
import { listCadastreLots, readApiError } from "./api";
import { fmt } from "./geo";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export default function LotList({ onOpenLot, onNewLot, reloadKey }) {
  const [lots, setLots] = useState([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await listCadastreLots(submittedQuery);
        if (!cancelled) setLots(rows);
      } catch (err) {
        if (!cancelled) setError(readApiError(err, "Impossible de charger les lots."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submittedQuery, reloadKey]);

  return (
    <div className="gt-ocr">
      <div className="gt-ocr-head">
        <div>
          <h2 className="gt-ocr-title">Lots cadastraux</h2>
          <p className="gt-ocr-sub">
            Lots extraits des documents « Calcul de Contenances » par OCR.
          </p>
        </div>
        <button type="button" className="gt-btn gt-btn-primary" onClick={onNewLot}>
          <Plus size={13} /> Nouveau lot
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedQuery(query.trim());
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par titre foncier ou propriété…"
          style={{
            flex: 1,
            border: "1px solid var(--line)",
            padding: "8px 10px",
            fontSize: 13,
            background: "#fff",
            color: "var(--ink)",
            fontFamily: "inherit",
          }}
        />
        <button type="submit" className="gt-btn gt-btn-neutral">
          <Search size={13} /> Rechercher
        </button>
      </form>

      <section className="gt-section">
        {error && <p className="gt-ocr-warn">{error}</p>}
        {!error && loading && <p className="gt-ocr-sub">Chargement…</p>}
        {!error && !loading && lots.length === 0 && (
          <p className="gt-ocr-sub" style={{ margin: 0 }}>
            Aucun lot enregistré pour l'instant. Importez un PDF pour commencer.
          </p>
        )}
        {!error && !loading && lots.length > 0 && (
          <table className="gt-ocr-table">
            <thead>
              <tr>
                <th>Titre foncier</th>
                <th>Propriété dite</th>
                <th className="num">Surface (m²)</th>
                <th>Statut</th>
                <th>Mis à jour</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => onOpenLot(lot.id)}
                      style={{
                        border: "none",
                        background: "none",
                        padding: 0,
                        color: "var(--accent)",
                        cursor: "pointer",
                        font: "inherit",
                      }}
                    >
                      {lot.titreFoncier}
                    </button>
                  </td>
                  <td>{lot.proprieteDite}</td>
                  <td className="num">{fmt(lot.surfaceDocumentM2)}</td>
                  <td>
                    <ConformiteBadge conforme={lot.conforme} />
                  </td>
                  <td style={{ color: "var(--muted)" }}>{fmtDate(lot.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
