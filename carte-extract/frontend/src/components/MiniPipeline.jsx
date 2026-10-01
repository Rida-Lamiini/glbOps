import React from "react";
import { STAGES, STAGE_COLORS } from "../constants";

export default function MiniPipeline({ stage }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="gt-minipipe" title={STAGES.find((s) => s.key === stage)?.label}>
      {STAGES.map((s, i) => (
        <div
          key={s.key}
          className="gt-minipipe-seg"
          style={i <= idx ? { background: STAGE_COLORS[stage] } : undefined}
        />
      ))}
    </div>
  );
}
