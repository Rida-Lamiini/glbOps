import React from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { STAGES } from "../constants";

export default function PipelineStepper({ stage, cycles }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div>
      <div className="gt-pipeline">
        {STAGES.map((s, i) => (
          <React.Fragment key={s.key}>
            <div className={`gt-pipe-step ${i < idx ? "done" : ""} ${i === idx ? "current" : ""}`}>
              <div className="gt-pipe-dot">{i < idx ? <CheckCircle2 size={11} /> : i + 1}</div>
              <div className="gt-pipe-label">{s.label}</div>
            </div>
            {i < STAGES.length - 1 && <div className={`gt-pipe-line ${i < idx ? "done" : ""}`} />}
          </React.Fragment>
        ))}
      </div>
      {cycles > 0 && (
        <div className="gt-pipe-loop">
          <RotateCcw size={12} strokeWidth={2.2} />
          Renvoyé en Exécution {cycles} fois (non-conformité ou données insuffisantes)
        </div>
      )}
    </div>
  );
}
