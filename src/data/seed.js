import { today } from "../utils/dates";

export const blankPrestation = (overrides = {}) => ({
  id: "",
  natureDemandee: "",
  natureExecutee: "",
  dateDebutDemande: "",
  dateFinDemande: "",
  agentChantier: [],
  materielIds: [],
  vehiculeId: "",
  dateDebutExec: "",
  dateFinExec: "",
  agentBureau: "",
  taches: [],
  cheminBureau: "",
  dateDebutBureau: "",
  dateFinBureau: "",
  agentControle: "",
  dateDebutControle: "",
  dateFinControle: "",
  dateLivraison: "",
  ref: "",
  chemin: "",
  cdN: "",
  disqueN: "",
  stage: "demande",
  cycles: 0,
  reprogramme: false,
  attachments: [],
  history: [{ date: today(), label: "Demande reçue" }],
  ...overrides,
});

export const blankEmployee = (overrides = {}) => ({
  role: "Agent Chantier",
  poste: "",
  telephone: "",
  email: "",
  dateEmbauche: "",
  status: "actif",
  conges: [],
  notes: "",
  ...overrides,
});

export const seedEmployees = () => [
  {
    id: "EMP-001", nom: "Pierre Lefèvre",
    ...blankEmployee({
      role: "Agent Chantier", poste: "Chef d'équipe", telephone: "06 61 20 30 40", email: "p.lefevre@globetudes.ma", dateEmbauche: "03/01/2019",
    }),
  },
  {
    id: "EMP-002", nom: "Marc Lambert",
    ...blankEmployee({
      role: "Agent Bureau", poste: "Agent bureau", telephone: "06 68 27 37 47", email: "m.lambert@globetudes.ma", dateEmbauche: "12/01/2019",
    }),
  },
  {
    id: "EMP-003", nom: "Julien Faure",
    ...blankEmployee({
      role: "Agent Contrôle", poste: "Agent contrôle", telephone: "06 71 30 40 50", email: "j.faure@globetudes.ma", dateEmbauche: "16/05/2020",
    }),
  },
  {
    id: "EMP-004", nom: "Sara Benjelloun",
    ...blankEmployee({
      role: "Agent Chantier", poste: "Topographe terrain", telephone: "06 54 18 22 09", email: "s.benjelloun@globetudes.ma", dateEmbauche: "07/09/2021",
      conges: [{ id: "CNG-001", type: "Congé payé", dateDebut: "28/09/2026", dateFin: "02/10/2026", statut: "approuve", motif: "Congés annuels" }],
    }),
  },
  {
    id: "EMP-005", nom: "Nadia Chraibi",
    ...blankEmployee({
      role: "Agent Bureau", poste: "Dessinatrice-projeteuse", telephone: "06 45 33 12 87", email: "n.chraibi@globetudes.ma", dateEmbauche: "20/02/2022",
    }),
  },
  {
    id: "EMP-006", nom: "Omar Idrissi",
    ...blankEmployee({
      role: "Agent Contrôle", poste: "Contrôleur qualité", telephone: "06 77 41 09 33", email: "o.idrissi@globetudes.ma", dateEmbauche: "11/11/2020",
      status: "inactif",
    }),
  },
];

export const blankClient = (overrides = {}) => ({
  contact: "",
  telephone: "",
  email: "",
  adresse: "",
  secteur: "",
  notes: "",
  ...overrides,
});

export const seedClients = () => [];

export const blankResource = (overrides = {}) => ({
  type: "autre",
  marque: "",
  modele: "",
  numeroSerie: "",
  status: "operationnel",
  derniereCalibration: "",
  prochaineCalibration: "",
  emplacement: "",
  dateAchat: "",
  valeur: "",
  fournisseur: "",
  maintenanceLog: [],
  attachments: [],
  ...overrides,
});

export const seedMateriels = () => [
  {
    id: "MAT-001", nom: "Station totale",
    ...blankResource({
      type: "station_totale", marque: "Leica", modele: "TS16", numeroSerie: "LC-88213", status: "operationnel",
      derniereCalibration: "15/03/2026", prochaineCalibration: "15/03/2027",
      emplacement: "Armoire matériel — Agence Rabat", dateAchat: "12/03/2023", valeur: "285 000 MAD", fournisseur: "Leica Geosystems Maroc",
    }),
  },
  {
    id: "MAT-002", nom: "GPS GNSS",
    ...blankResource({
      type: "gps", marque: "Trimble", modele: "R12i", numeroSerie: "TR-55019", status: "operationnel",
      derniereCalibration: "02/05/2026", prochaineCalibration: "02/05/2027",
      emplacement: "Armoire matériel — Agence Rabat", dateAchat: "18/06/2023", valeur: "195 000 MAD", fournisseur: "Trimble Maroc",
    }),
  },
  {
    id: "MAT-003", nom: "Drone cartographie",
    ...blankResource({
      type: "drone", marque: "DJI", modele: "Matrice 350 RTK", numeroSerie: "DJ-40217", status: "operationnel",
      derniereCalibration: "20/07/2026", prochaineCalibration: "20/01/2027",
      emplacement: "Local drone — Agence Rabat", dateAchat: "05/09/2024", valeur: "165 000 MAD", fournisseur: "Aeromaroc",
    }),
  },
  {
    id: "MAT-004", nom: "Scanner 3D LiDAR",
    ...blankResource({
      type: "scanner", marque: "Leica", modele: "RTC360", numeroSerie: "LC-91345", status: "maintenance",
      derniereCalibration: "10/01/2026", prochaineCalibration: "10/01/2027",
      emplacement: "Atelier technique — Agence Rabat", dateAchat: "22/11/2022", valeur: "540 000 MAD", fournisseur: "Leica Geosystems Maroc",
    }),
  },
  {
    id: "MAT-005", nom: "Niveau optique",
    ...blankResource({
      type: "niveau", marque: "Sokkia", modele: "B40A", numeroSerie: "SK-11278", status: "operationnel",
      derniereCalibration: "08/04/2026", prochaineCalibration: "08/04/2027",
      emplacement: "Armoire matériel — Agence Rabat", dateAchat: "14/01/2021", valeur: "22 000 MAD", fournisseur: "Sokkia Maroc",
    }),
  },
];

export const seedVehicules = () => [
  {
    id: "VEH-001", nom: "4x4 — 12345-A-6",
    ...blankResource({
      type: "vehicule", marque: "Toyota", modele: "Hilux", numeroSerie: "12345-A-6", status: "operationnel",
      emplacement: "Parking — Agence Rabat", dateAchat: "03/02/2022", valeur: "320 000 MAD", fournisseur: "Toyota du Maroc",
    }),
  },
  {
    id: "VEH-002", nom: "Citadine — 33210-A-6",
    ...blankResource({
      type: "vehicule", marque: "Dacia", modele: "Duster", numeroSerie: "33210-A-6", status: "maintenance",
      emplacement: "Garage — Agence Rabat", dateAchat: "19/05/2023", valeur: "180 000 MAD", fournisseur: "Renault Maroc",
    }),
  },
];

export const seedProjets = () => [];
