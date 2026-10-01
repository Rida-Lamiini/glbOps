import React from "react";

export const emptyReferencePointRow = () => ({ label: "", lat: "", lng: "" });

export default function ReferencePointTable({ rows, onChange }) {
  const update = (index, patch) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div>
      <table className="gt-ocr-table">
        <thead>
          <tr>
            <th>Libellé</th>
            <th>Latitude</th>
            <th>Longitude</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Point de repère"
                />
              </td>
              <td>
                <input
                  value={row.lat}
                  onChange={(e) => update(i, { lat: e.target.value })}
                  placeholder="33.3653297"
                  inputMode="decimal"
                />
              </td>
              <td>
                <input
                  value={row.lng}
                  onChange={(e) => update(i, { lng: e.target.value })}
                  placeholder="-7.5719223"
                  inputMode="decimal"
                />
              </td>
              <td style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="gt-ocr-rowdel"
                  onClick={() => remove(i)}
                  aria-label="Supprimer le point de référence"
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
        onClick={() => onChange([...rows, emptyReferencePointRow()])}
      >
        + Ajouter un point de référence
      </button>
    </div>
  );
}
