export const STAGES = [
  { key: "demande", label: "Demande" },
  { key: "prestation", label: "Prestation demandée" },
  { key: "affectation", label: "Affectation terrain" },
  { key: "execution", label: "Exécution" },
  { key: "bureau", label: "Traitement bureau" },
  { key: "controle", label: "Contrôle" },
  { key: "livraison", label: "Livraison" },
];

export const STAGE_COLORS = {
  demande: "var(--muted)",
  prestation: "var(--blue)",
  affectation: "var(--accent)",
  execution: "var(--amber)",
  bureau: "var(--teal)",
  controle: "var(--violet)",
  livraison: "var(--good)",
};

export const NATURES = [
  "Levé topographique",
  "Bornage terrain",
  "Relevé LiDAR",
  "Cartographie drone",
  "Implantation VRD",
  "Auscultation structure",
];

export const LIVRABLE_TYPES = [
  "Plan topographique",
  "Rapport de bornage",
  "Orthophoto",
  "Nuage de points",
  "Autre",
];

export const ROLES = ["Dispatcher", "Directrice", "Agent Chantier", "Agent Bureau", "Agent Contrôle"];

// Hex-literal twins of the semantic tokens in tokens.css (--status-success/info/warning/
// danger/neutral) — MapLibre paint properties and the jsPDF legend export can't resolve CSS
// custom properties, so these stay duplicated, but numerically identical to what every other
// view (Kanban pills, stat cards) uses for the same status.
export const STATUS_COLORS = {
  vide: "#6B7280",
  nonconforme: "#DC2626",
  encours: "#2563EB",
  livre: "#16A34A",
};

export const STATUS_LABELS = {
  vide: "Sans prestation",
  nonconforme: "Non-conformité",
  encours: "En cours",
  livre: "Livré",
};

// Maps the same status keys onto the shared semantic pill kinds (tokens.css) so every view
// (Kanban, cards, stats) colors "livré"/"en cours"/"non-conforme" identically.
export const STATUS_PILL_KIND = {
  vide: "neutral",
  nonconforme: "danger",
  encours: "info",
  livre: "success",
};

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const RESOURCE_STATUSES = [
  { key: "operationnel", label: "Opérationnel", color: "#3F7855", pill: "success" },
  { key: "maintenance", label: "En maintenance", color: "#C98A2C", pill: "warning" },
  { key: "hors_service", label: "Hors service", color: "#B23A2E", pill: "danger" },
];

export const EMPLOYEE_STATUSES = [
  { key: "actif", label: "Actif", color: "#3F7855", pill: "success" },
  { key: "inactif", label: "Inactif", color: "#6B6F66", pill: "neutral" },
];

export const CONGE_TYPES = ["Congé payé", "Congé maladie", "Congé sans solde", "Autre"];

export const CONGE_STATUSES = [
  { key: "en_attente", label: "En attente", color: "#C98A2C", pill: "warning" },
  { key: "approuve", label: "Approuvé", color: "#3F7855", pill: "success" },
  { key: "refuse", label: "Refusé", color: "#B23A2E", pill: "danger" },
];

export const ATTACHMENT_TYPES = [
  { key: "photo", label: "Photo terrain" },
  { key: "livrable", label: "Livrable (PV/DWG)" },
  { key: "autre", label: "Autre document" },
];

export const NON_CONFORMITY_SOURCES = [
  { key: "chantier", label: "Agent Chantier (exécution terrain)" },
  { key: "bureau", label: "Agent Bureau (traitement)" },
];

export const RESOURCE_TYPES = [
  { key: "station_totale", label: "Station totale", icon: "Compass" },
  { key: "gps", label: "GPS / GNSS", icon: "Satellite" },
  { key: "drone", label: "Drone", icon: "PlaneTakeoff" },
  { key: "scanner", label: "Scanner 3D / LiDAR", icon: "Scan" },
  { key: "niveau", label: "Niveau optique", icon: "GaugeCircle" },
  { key: "vehicule", label: "Véhicule", icon: "Truck" },
  { key: "autre", label: "Autre", icon: "Boxes" },
];
