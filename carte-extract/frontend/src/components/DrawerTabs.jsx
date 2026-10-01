import React from "react";

/** Sticky tab bar shared by the detail drawers (styles: .pd-tabs in projet-drawer.css). */
export default function DrawerTabs({ tabs, value, onChange, label = "Sections" }) {
  return (
    <div className="pd-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          className={`pd-tab ${value === t.key ? "is-active" : ""}`}
          onClick={() => onChange(t.key)}
        >
          <t.icon size={14} />
          <span>{t.label}</span>
          {t.count > 0 && <span className="pd-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
