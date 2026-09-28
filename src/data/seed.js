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

// Raw "lots" list transcribed from the client's platform export (CODI / CLIENT / PLAN COTE /
// PROJET table). PLAN COTE is their internal survey-plan reference (REF5PCxxxx); PROJET holds
// either a Titre Foncier reference or a free-text project name. CODI "132" is used for both "FM6"
// and its full name "FONDATION MOHAMMED VI DES SCIENCES ET DE LA SANTÉ" in the source — same
// client, so it's merged into one record below.
const LOTS_RAW = [
  { codi: "106", client: "CGI", planCote: "REF5PC0001", projet: "TF199608/04" },
  { codi: "307", client: "MR CHENOUF", planCote: "REF5PC0002", projet: "TF49424-16" },
  { codi: "164", client: "ENGIE CONSEIL", planCote: "REF5PC0004", projet: "TF27492/C" },
  { codi: "297", client: "ZOWN", planCote: "REF5PC0003", projet: "TF67022/64" },
  { codi: "166", client: "REDA TAZI", planCote: "REF5PC0005", projet: "TF5950/13" },
  { codi: "1", client: "PRIMARIOS", planCote: "REF5PC0006", projet: "TF26481C" },
  { codi: "132", client: "FM6", planCote: "REF5PC0007", projet: "TF9713_58" },
  { codi: "132", client: "FM6", planCote: "REF5PC0008", projet: "TF4150/M" },
  { codi: "164", client: "ENGIE CONSEIL", planCote: "REF5PC0009", projet: "TF43330/C" },
  { codi: "315", client: "ARCHI GUDIRA", planCote: "REF5PC0010", projet: "TF10334/20" },
  { codi: "127", client: "MFADEL", planCote: "REF5PC0011", projet: "TF1900/48" },
  { codi: "132", client: "FM6", planCote: "REF5PC0012", projet: "TF27298M-ISTA" },
  { codi: "308", client: "ALLIANCE", planCote: "REF5PC0013", projet: "TF10959_25" },
  { codi: "127", client: "MFADEL", planCote: "REF5PC0015", projet: "TF22702/64" },
  { codi: "308", client: "ALLIANCE", planCote: "REF5PC0016", projet: "TF29027/C" },
  { codi: "164", client: "ENGIE CONSEIL", planCote: "REF5PC0017", projet: "T5152_34" },
  { codi: "155", client: "SUZNET", planCote: "REF5PC0018", projet: "TF136780-06" },
  { codi: "132", client: "FM6", planCote: "REF5PC0019", projet: "TF21839_50" },
  { codi: "272", client: "STE RAHTNA", planCote: "REF5PC0021", projet: "TF66912_58" },
  { codi: "169", client: "HASSAN KHALILI", planCote: "REF5PC0022", projet: "TF74051/58" },
  { codi: "132", client: "FM6", planCote: "REF5PC0022-BIS", projet: "HUM6-AGADIR" },
  { codi: "118", client: "PICTOGRAMME", planCote: "REF5PC0023", projet: "TF152760/04 & TF152761/04" },
  { codi: "103", client: "MACOBAT", planCote: "REF5PC0024", projet: "TF32293_78" },
  { codi: "195", client: "CITRUS VALLY VILLAGE", planCote: "REF5PC0025", projet: "TF27147R" },
  { codi: "164", client: "ENGIE CONSEIL", planCote: "REF5PC0026", projet: "MAFODER -TF5152_34" },
  { codi: "326", client: "Cooperative agricole Copag", planCote: "REF5PC0029", projet: "TF81781/03" },
  { codi: "204", client: "SAKAN BENAMAR", planCote: "REF5PC0032", projet: "TF22204/38" },
  { codi: "204", client: "SAKAN BENAMAR", planCote: "REF5PC0033", projet: "TF22202/38" },
  { codi: "128", client: "TENOR", planCote: "REF5PC0035", projet: "TF184447-03" },
  { codi: "118", client: "PICTOGRAMME", planCote: "REF5PC0036", projet: "TF140963-63" },
  { codi: "132", client: "FM6", planCote: "REF5PC0037", projet: "SOINS DE SUITE ET DE REEDUCATION" },
  { codi: "132", client: "FM6", planCote: "REF5PC0038", projet: "EXTENSION DE L'HUIM6-BOUSKOURA" },
  { codi: "132", client: "FM6", planCote: "REF5PC0039", projet: "TF16162-C CENTRE DE LA SANTE MKANSA" },
  { codi: "132", client: "FM6", planCote: "REF5PC0040", projet: "Ecôle des metiers de la santé hopital panoramic" },
  { codi: "132", client: "FM6", planCote: "REF5PC0041", projet: "Hup dar bouazza" },
  { codi: "132", client: "FM6", planCote: "REF5PC0042", projet: "C lub des ouevres sociales FM6SS" },
  { codi: "316", client: "AUTO HALL-LALA YAKOUT", planCote: "REF5PC0043", projet: "TF13311-C" },
  { codi: "106", client: "CGI", planCote: "REF5PC0044", projet: "TF68266/64" },
  { codi: "234", client: "MARBIO", planCote: "REF5PC0045", projet: "TF84838/25" },
  { codi: "132", client: "FM6", planCote: "REF5PC0049", projet: "TF114533/03" },
  { codi: "132", client: "FM6", planCote: "REF5PC00492025-1", projet: "HM5" },
  { codi: "", client: "HUIM6", planCote: "REF5PC0050", projet: "AGADIR" },
  { codi: "247", client: "AGASTUDIO", planCote: "REF5PC0051", projet: "TF83102/43" },
  { codi: "346", client: "Mme khadouj chakara", planCote: "REF5PC0052", projet: "TF10398/78" },
  { codi: "118", client: "PICTOGRAMME", planCote: "REF5PC0053", projet: "TF30301/C" },
  { codi: "359", client: "KAROUCH", planCote: "REF5PC0055", projet: "TF12117/50" },
  { codi: "156", client: "TUYATO", planCote: "REF5PC0058", projet: "6TF" },
];

const clientIdFor = (row) =>
  row.codi ? `CLI-${row.codi.padStart(4, "0")}` : `CLI-${row.client.replace(/\s+/g, "").toUpperCase()}`;

export const seedClients = () => {
  const byId = new Map();
  LOTS_RAW.forEach((row) => {
    const id = clientIdFor(row);
    if (!byId.has(id)) {
      byId.set(id, { id, nom: row.client, code: row.codi, ...blankClient() });
    }
  });
  // Source list spells this client's name two ways ("FM6" / "FONDATION MOHAMMED VI DES
  // SCIENCES ET DE LA SANTÉ") under the same CODI — keep the short name, note the full one.
  const fm6 = byId.get("CLI-0132");
  if (fm6) fm6.notes = "Fondation Mohammed VI des Sciences et de la Santé";
  return [...byId.values()];
};

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

// No situation/coordinates in the source list — situation falls back to the client name so
// records render sensibly; these lots simply won't appear on the Carte until geolocated.
export const seedProjets = () => LOTS_RAW.map((row, i) => ({
  id: `LOT-${String(i + 1).padStart(4, "0")}`,
  clientId: clientIdFor(row),
  referenceFonciere: row.projet,
  planCote: row.planCote,
  situation: row.client,
  lat: null,
  lng: null,
  naturePrestationProjet: "",
  dateDebut: "",
  notes: "",
  attachments: [],
  prestations: [],
}));
