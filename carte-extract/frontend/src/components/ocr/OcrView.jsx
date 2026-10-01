import React, { useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import LotList from "./LotList";
import LotDetail from "./LotDetail";
import NewLot from "./NewLot";
import OverviewMap from "./OverviewMap";
import "./ocr.css";

const TABS = [
  { key: "list", label: "Lots", icon: List },
  { key: "map", label: "Carte", icon: MapIcon },
];

/**
 * Entry point for the OCR / cadastre module (PDF → bornes → géométrie → carte).
 *
 * Everything the feature owns lives under components/ocr/, so this file is the
 * only thing the rest of the app imports: GlobetudesProjets renders it for
 * `view === "ocr"`. The app has no router, so the module keeps its own small
 * screen state the same way the rest of the app does with drawers.
 */
export default function OcrView() {
  const [screen, setScreen] = useState({ name: "list" });
  // Bumped after a save so the list and the map refetch instead of showing a
  // stale view of the lots.
  const [reloadKey, setReloadKey] = useState(0);

  if (screen.name === "new") {
    return (
      <NewLot
        onCancel={() => setScreen({ name: "list" })}
        onSaved={(id) => {
          setReloadKey((k) => k + 1);
          setScreen({ name: "detail", id });
        }}
      />
    );
  }

  if (screen.name === "detail") {
    return <LotDetail lotId={screen.id} onBack={() => setScreen({ name: "list" })} />;
  }

  const openLot = (id) => setScreen({ name: "detail", id });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "10px 20px 0",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setScreen({ name: tab.key })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "none",
              background: "none",
              padding: "7px 12px",
              fontSize: 12.5,
              cursor: "pointer",
              color: screen.name === tab.key ? "var(--ink)" : "var(--muted)",
              borderBottom:
                screen.name === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            <tab.icon size={13} /> {tab.label}
          </button>
        ))}
      </div>

      {screen.name === "map" ? (
        <OverviewMap key={reloadKey} onOpenLot={openLot} />
      ) : (
        <LotList
          reloadKey={reloadKey}
          onNewLot={() => setScreen({ name: "new" })}
          onOpenLot={openLot}
        />
      )}
    </div>
  );
}
