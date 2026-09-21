import React from "react";

export default function ConformiteBadge({ conforme }) {
  return (
    <span className={`gt-ocr-badge ${conforme ? "ok" : "bad"}`}>
      {conforme ? "Conforme" : "Écart"}
    </span>
  );
}
