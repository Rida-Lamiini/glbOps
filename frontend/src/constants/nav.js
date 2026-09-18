import { LayoutDashboard, List, Building2, Wrench, Truck, UserRound, Map as MapIcon, Calendar, FileScan } from "lucide-react";

// Single source for nav items — used by AppSidebar (grouped) and the topbar (to echo the
// active section's icon/color next to the page title), so the two never drift apart.
export const NAV_GROUPS = [
  {
    label: "Suivi",
    items: [
      { key: "overview", label: "Vue d'ensemble", icon: LayoutDashboard, color: "var(--ink)" },
      { key: "projets", label: "Projets", icon: List, color: "var(--accent)" },
      { key: "carte", label: "Carte", icon: MapIcon, color: "var(--status-success)" },
      { key: "calendrier", label: "Calendrier", icon: Calendar, color: "var(--blue)" },
    ],
  },
  {
    label: "Ressources",
    items: [
      { key: "clients", label: "Clients", icon: Building2, color: "var(--status-info)" },
      { key: "materiels", label: "Matériel", icon: Wrench, color: "var(--status-warning)" },
      { key: "vehicules", label: "Véhicules", icon: Truck, color: "var(--teal)" },
      { key: "employes", label: "Employés", icon: UserRound, color: "var(--violet)" },
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
