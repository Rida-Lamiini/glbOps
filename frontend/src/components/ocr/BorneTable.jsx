import React from "react";

export const emptyBorneRow = () => ({ name: "", xLambert: "", yLambert: "" });

export default function BorneTable({ rows, onChange }) {
  const update = (index, patch) => {
    onChange(
      rows.map((r, i) =>
        // Editing a flagged row is how the user confirms/corrects it — clear the flag.
        i === index ? { ...r, ...patch, flagged: false, flagReason: undefined } : r,
      ),
    );
  };
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div>
      <table className="gt-ocr-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Borne</th>
            <th>X (Lambert)</th>
            <th>Y (Lambert)</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={row.flagged ? "flagged" : ""}>
              <td style={{ color: "var(--muted)" }}>{i + 1}</td>
              <td>
                <input
                  className={row.flagged ? "flagged" : ""}
                  value={row.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="B3452"
                  title={row.flagReason}
                />
              </td>
              <td>
                <input
                  className={row.flagged ? "flagged" : ""}
                  value={row.xLambert}
                  onChange={(e) => update(i, { xLambert: e.target.value })}
                  placeholder="313952.15"
                  inputMode="decimal"
                  title={row.flagReason}
                />
              </td>
              <td>
                <input
                  className={row.flagged ? "flagged" : ""}
                  value={row.yLambert}
                  onChange={(e) => update(i, { yLambert: e.target.value })}
                  placeholder="377797.12"
                  inputMode="decimal"
                  title={row.flagReason}
                />
              </td>
              <td style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="gt-ocr-rowdel"
                  onClick={() => remove(i)}
                  aria-label="Supprimer la borne"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.some((r) => r.flagged) && (
        <p className="gt-ocr-warn" style={{ marginTop: 8 }}>
          Lignes en rouge : valeur suspecte détectée automatiquement (OCR) — survolez le champ pour
          la raison, puis vérifiez et corrigez avant d'enregistrer.
        </p>
      )}

      <button
        type="button"
        className="gt-ocr-addrow"
        onClick={() => onChange([...rows, emptyBorneRow()])}
      >
        + Ajouter une borne
      </button>
    </div>
  );
}
