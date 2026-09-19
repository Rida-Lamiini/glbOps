import React, { useEffect, useRef, useState } from "react";

// A table needs roughly this much width per column before it starts scrolling sideways; below
// that, each row is shown as a card instead.
const PX_PER_COLUMN = 125;
const MIN_BREAKPOINT_PX = 760;

/**
 * Wraps a shadcn <Table>. Copies each column header onto its cells as `data-label`, and toggles a
 * card layout (see .gt-table-card.is-cards in app.css) when the container is too narrow for the
 * table — so list views never need a horizontal scrollbar.
 */
export default function ResponsiveTableCard({ children }) {
  const ref = useRef(null);
  const [cards, setCards] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const columns = el.querySelectorAll("thead th").length || 6;
      setCards(el.getBoundingClientRect().width < Math.max(MIN_BREAKPOINT_PX, columns * PX_PER_COLUMN));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Runs after every render: rows come and go with filters and sorting.
  useEffect(() => {
    const table = ref.current?.querySelector("table");
    if (!table) return;
    const labels = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    table.querySelectorAll("tbody tr").forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (td.colSpan > 1) td.removeAttribute("data-label");
        else if (labels[i]) td.setAttribute("data-label", labels[i]);
      });
    });
  });

  return (
    <div ref={ref} className={`gt-table-card ${cards ? "is-cards" : ""}`}>
      {children}
    </div>
  );
}
