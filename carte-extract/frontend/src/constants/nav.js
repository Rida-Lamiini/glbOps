import { List, Building2, Map as MapIcon, FileScan } from "lucide-react";

// Single source for nav items — used by AppSidebar (grouped) and the topbar (to echo the
// active section's icon/color next to the page title), so the two never drift apart.
export const NAV_GROUPS = [
  {
    label: "Suivi",
    items: [
      { key: "projets", label: "Projets", icon: List, color: "var(--accent)" },
      { key: "carte", label: "Carte", icon: MapIcon, color: "var(--status-success)" },
    ],
  },
  {
    label: "Ressources",
    items: [
      { key: "clients", label: "Clients", icon: Building2, color: "var(--status-info)" },
    ],
  },
  {
    label: "Outils",
    items: [
      { key: "cadastre", label: "Cadastre", icon: FileScan, color: "var(--status-info)" },
    ],
  },
];

export const NAV_ITEMS_FLAT = NAV_GROUPS.flatMap((g) => g.items);
