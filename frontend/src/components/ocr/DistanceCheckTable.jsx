import React from "react";

export const emptyDistanceCheckRow = () => ({ segmentLabel: "", croquisM: "" });

export default function DistanceCheckTable({ rows, onChange }) {
  const update = (index, patch) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div>
      <table className="gt-ocr-table">
        <thead>
          <tr>
            <th>Segment (ex : B3452-B3453)</th>
            <th>Croquis (m)</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  value={row.segmentLabel}
                  onChange={(e) => update(i, { segmentLabel: e.target.value })}
                  placeholder="B3452-B3453"
                />
              </td>
              <td>
                <input
                  value={row.croquisM}
                  onChange={(e) => update(i, { croquisM: e.target.value })}
                  placeholder="45.67"
                  inputMode="decimal"
                />
              </td>
              <td style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="gt-ocr-rowdel"
                  onClick={() => remove(i)}
                  aria-label="Supprimer le contrôle"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="gt-ocr-addrow"
        onClick={() => onChange([...rows, emptyDistanceCheckRow()])}
      >
        + Ajouter un contrôle de distance
      </button>
    </div>
  );
}
