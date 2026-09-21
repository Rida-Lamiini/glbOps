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

export const seedClients = () => [
  {
    id: "CLI-0231", nom: "SOMADIR Immobilier", code: "CLI-0231",
    ...blankClient({
      contact: "Rania El Fassi", telephone: "05 37 71 20 10", email: "r.elfassi@somadir.ma",
      adresse: "12 Avenue Annakhil, Hay Riad, Rabat", secteur: "Promotion immobilière",
    }),
  },
  {
    id: "CLI-0232", nom: "Groupe Alliances", code: "CLI-0232",
    ...blankClient({
      contact: "Yassine Kabbaj", telephone: "05 22 95 40 18", email: "y.kabbaj@alliances.ma",
      adresse: "Twin Center, Boulevard Zerktouni, Casablanca", secteur: "Promotion immobilière",
    }),
  },
  {
    id: "CLI-0233", nom: "Al Omrane Rabat", code: "CLI-0233",
    ...blankClient({
      contact: "Khadija Bennis", telephone: "05 37 68 12 44", email: "k.bennis@alomrane.ma",
      adresse: "Avenue Al Alaouiyine, Agdal, Rabat", secteur: "Aménagement urbain",
    }),
  },
  {
    id: "CLI-0234", nom: "ONEE — Branche Eau", code: "CLI-0234",
    ...blankClient({
      contact: "Hicham Radi", telephone: "05 37 65 91 22", email: "h.radi@onee.ma",
      adresse: "Station de traitement, Route de Zaër, Rabat", secteur: "Infrastructure publique",
    }),
  },
];

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
  assuranceCompagnie: "",
  assurancePolice: "",
  assuranceDebut: "",
  assuranceEcheance: "",
  assurancePrime: "",
  visiteTechniqueDerniere: "",
  visiteTechniqueProchaine: "",
  vignettePaiement: "",
  vignetteEcheance: "",
  kilometrage: "",
  kilometrageDate: "",
  entretienProchainDate: "",
  entretienProchainKm: "",
  carburant: "",
  carteCarburant: "",
  conducteur: "",
  sortieCourante: null,
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

export const seedProjets = () => [
  {
    id: "PRJ-2026-001", clientId: "CLI-0231",
    referenceFonciere: "TF/58210/R", situation: "Hay Riad, Rabat",
    lat: 33.9654, lng: -6.8498,
    naturePrestationProjet: "Levé topographique",
    dateDebut: "01/09/2026", notes: "", attachments: [],
    prestations: [],
  },
  {
    id: "PRJ-2026-002", clientId: "CLI-0232",
    referenceFonciere: "TF/61044/C", situation: "Twin Center, Boulevard Zerktouni, Casablanca",
    lat: 33.5850, lng: -7.6320,
    naturePrestationProjet: "Bornage terrain",
    dateDebut: "05/09/2026", notes: "", attachments: [],
    prestations: [
      blankPrestation({
        id: "PRS-2026-101",
        natureDemandee: "Bornage terrain — 3 lots",
        dateDebutDemande: "05/09/2026",
        stage: "demande",
        history: [{ date: "05/09/2026", label: "Demande reçue", author: "Dispatcher" }],
      }),
    ],
  },
  {
    id: "PRJ-2026-003", clientId: "CLI-0233",
    referenceFonciere: "TF/44872/R", situation: "Sidi Yahya Zaer, Rabat",
    lat: 33.9280, lng: -6.5830,
    naturePrestationProjet: "Implantation VRD",
    dateDebut: "20/08/2026", notes: "Lotissement 40 lots, phase 1", attachments: [],
    prestations: [
      blankPrestation({
        id: "PRS-2026-102",
        natureDemandee: "Implantation VRD — lotissement 40 lots",
        dateDebutDemande: "20/08/2026", dateFinDemande: "22/08/2026",
        stage: "affectation",
        agentChantier: ["Pierre Lefèvre"],
        materielIds: ["MAT-001"],
        vehiculeId: "VEH-001",
        agentBureau: "Marc Lambert",
        agentControle: "Julien Faure",
        dateDebutExec: "18/09/2026",
        history: [
          { date: "20/08/2026", label: "Demande reçue", author: "Dispatcher" },
          { date: "22/08/2026", label: "Prestation confirmée", author: "Directrice" },
          { date: "10/09/2026", label: "Affectation : Pierre Lefèvre — visite prévue le 18/09/2026", author: "Dispatcher" },
        ],
      }),
    ],
  },
  {
    id: "PRJ-2026-004", clientId: "CLI-0234",
    referenceFonciere: "TF/39120/R", situation: "Station de traitement, Route de Zaër, Rabat",
    lat: 33.9430, lng: -6.9120,
    naturePrestationProjet: "Relevé LiDAR",
    dateDebut: "15/08/2026", notes: "", attachments: [],
    prestations: [
      blankPrestation({
        id: "PRS-2026-103",
        natureDemandee: "Relevé LiDAR station de traitement",
        dateDebutDemande: "15/08/2026", dateFinDemande: "16/08/2026",
        stage: "execution",
        agentChantier: ["Sara Benjelloun"],
        materielIds: ["MAT-003"],
        vehiculeId: "VEH-001",
        agentBureau: "Nadia Chraibi",
        agentControle: "Omar Idrissi",
        dateDebutExec: "05/09/2026",
        history: [
          { date: "15/08/2026", label: "Demande reçue", author: "Dispatcher" },
          { date: "16/08/2026", label: "Prestation confirmée", author: "Directrice" },
          { date: "28/08/2026", label: "Affectation : Sara Benjelloun — visite prévue le 05/09/2026", author: "Dispatcher" },
          { date: "05/09/2026", label: "Passage à l'exécution — visite du 05/09/2026", author: "Sara Benjelloun" },
        ],
      }),
    ],
  },
  {
    id: "PRJ-2026-005", clientId: "CLI-0231",
    referenceFonciere: "TF/52310/C", situation: "Californie, Casablanca",
    lat: 33.5590, lng: -7.6050,
    naturePrestationProjet: "Cartographie drone",
    dateDebut: "01/08/2026", notes: "", attachments: [],
    prestations: [
      blankPrestation({
        id: "PRS-2026-104",
        natureDemandee: "Cartographie drone — terrain 8ha",
        natureExecutee: "Vol drone réalisé sur 8ha, 420 clichés capturés",
        dateDebutDemande: "01/08/2026", dateFinDemande: "02/08/2026",
        stage: "bureau",
        agentChantier: ["Pierre Lefèvre"],
        materielIds: ["MAT-003"],
        vehiculeId: "VEH-001",
        dateDebutExec: "18/08/2026", dateFinExec: "18/08/2026 16:30",
        agentBureau: "Marc Lambert",
        agentControle: "Julien Faure",
        taches: [
          { label: "Orthophoto", done: true, agents: ["Marc Lambert"] },
          { label: "Nuage de points", done: false, agents: ["Marc Lambert"] },
        ],
        dateDebutBureau: "19/08/2026",
        cheminBureau: "\\\\SERVEUR\\Projets\\PRJ-2026-005\\bureau\\",
        history: [
          { date: "01/08/2026", label: "Demande reçue", author: "Dispatcher" },
          { date: "02/08/2026", label: "Prestation confirmée", author: "Directrice" },
          { date: "12/08/2026", label: "Affectation : Pierre Lefèvre — visite prévue le 18/08/2026", author: "Dispatcher" },
          { date: "18/08/2026", label: "Passage à l'exécution — visite du 18/08/2026", author: "Pierre Lefèvre" },
          { date: "18/08/2026", label: "Exécution saisie — Vol drone réalisé sur 8ha, 420 clichés capturés", author: "Pierre Lefèvre" },
          { date: "19/08/2026", label: "Tâches affectées — Orthophoto, Nuage de points", author: "Marc Lambert" },
        ],
      }),
    ],
  },
  {
    id: "PRJ-2026-006", clientId: "CLI-0232",
    referenceFonciere: "TF/47033/C", situation: "Ain Sebaâ, Casablanca",
    lat: 33.6070, lng: -7.5330,
    naturePrestationProjet: "Auscultation structure",
    dateDebut: "10/07/2026", notes: "Pont RN1 — franchissement voie ferrée", attachments: [],
    prestations: [
      blankPrestation({
        id: "PRS-2026-105",
        natureDemandee: "Auscultation structure — pont RN1",
        natureExecutee: "Relevé des fissures et déformations réalisé",
        dateDebutDemande: "10/07/2026", dateFinDemande: "11/07/2026",
        stage: "controle",
        agentChantier: ["Sara Benjelloun"],
        materielIds: ["MAT-005"],
        vehiculeId: "VEH-001",
        dateDebutExec: "22/07/2026", dateFinExec: "23/07/2026 12:00",
        agentBureau: "Nadia Chraibi",
        agentControle: "Julien Faure",
        taches: [{ label: "Rapport de bornage", done: true, agents: ["Nadia Chraibi"] }],
        ref: "LIV-2026-0142",
        cheminBureau: "\\\\SERVEUR\\Projets\\PRJ-2026-006\\bureau\\rapport_v2.pdf",
        dateDebutBureau: "24/07/2026", dateFinBureau: "29/07/2026",
        dateDebutControle: "30/07/2026",
        history: [
          { date: "10/07/2026", label: "Demande reçue", author: "Dispatcher" },
          { date: "11/07/2026", label: "Prestation confirmée", author: "Directrice" },
          { date: "18/07/2026", label: "Affectation : Sara Benjelloun — visite prévue le 22/07/2026", author: "Dispatcher" },
          { date: "22/07/2026", label: "Passage à l'exécution — visite du 22/07/2026", author: "Sara Benjelloun" },
          { date: "23/07/2026", label: "Exécution saisie — Relevé des fissures et déformations réalisé", author: "Sara Benjelloun" },
          { date: "24/07/2026", label: "Tâches affectées — Rapport de bornage", author: "Nadia Chraibi" },
          { date: "29/07/2026", label: "Traitement bureau terminé — Rapport de bornage", author: "Nadia Chraibi" },
        ],
      }),
    ],
  },
  {
    id: "PRJ-2026-007", clientId: "CLI-0233",
    referenceFonciere: "TF/36018/R", situation: "Tamesna, Rabat",
    lat: 33.8210, lng: -6.8340,
    naturePrestationProjet: "Levé topographique",
    dateDebut: "01/06/2026", notes: "", attachments: [],
    prestations: [
      blankPrestation({
        id: "PRS-2026-106",
        natureDemandee: "Levé topographique — assiette foncière 12ha",
        natureExecutee: "Levé complet réalisé, 340 points levés",
        dateDebutDemande: "01/06/2026", dateFinDemande: "02/06/2026",
        stage: "livraison",
        agentChantier: ["Pierre Lefèvre"],
        materielIds: ["MAT-001", "MAT-002"],
        vehiculeId: "VEH-001",
        dateDebutExec: "15/06/2026", dateFinExec: "16/06/2026 15:00",
        agentBureau: "Marc Lambert",
        agentControle: "Julien Faure",
        taches: [{ label: "Plan topographique", done: true, agents: ["Marc Lambert"] }],
        ref: "LIV-2026-0098",
        cheminBureau: "\\\\SERVEUR\\Projets\\PRJ-2026-007\\bureau\\plan_v3.dwg",
        dateDebutBureau: "17/06/2026", dateFinBureau: "25/06/2026",
        dateDebutControle: "26/06/2026", dateFinControle: "01/07/2026",
        dateLivraison: "20/07/2026",
        chemin: "\\\\SERVEUR\\Projets\\PRJ-2026-007\\livraison\\",
        cdN: "CD-0118", disqueN: "DQ-041",
        history: [
          { date: "01/06/2026", label: "Demande reçue", author: "Dispatcher" },
          { date: "02/06/2026", label: "Prestation confirmée", author: "Directrice" },
          { date: "10/06/2026", label: "Affectation : Pierre Lefèvre — visite prévue le 15/06/2026", author: "Dispatcher" },
          { date: "15/06/2026", label: "Passage à l'exécution — visite du 15/06/2026", author: "Pierre Lefèvre" },
          { date: "16/06/2026", label: "Exécution saisie — Levé complet réalisé, 340 points levés", author: "Pierre Lefèvre" },
          { date: "17/06/2026", label: "Tâches affectées — Plan topographique", author: "Marc Lambert" },
          { date: "25/06/2026", label: "Traitement bureau terminé — Plan topographique", author: "Marc Lambert" },
          { date: "01/07/2026", label: "Contrôle conforme", author: "Julien Faure" },
          { date: "20/07/2026", label: "Livré — Réf LIV-2026-0098", author: "Directrice" },
        ],
      }),
    ],
  },
  {
    id: "PRJ-2026-008", clientId: "CLI-0234",
    referenceFonciere: "TF/61987/S", situation: "Quartier industriel, Salé",
    lat: 34.0530, lng: -6.7990,
    naturePrestationProjet: "Bornage terrain",
    dateDebut: "05/07/2026", notes: "", attachments: [],
    prestations: [
      blankPrestation({
        id: "PRS-2026-107",
        natureDemandee: "Bornage terrain — 14 bornes, lotissement industriel",
        natureExecutee: "Bornage réalisé, 14 bornes posées",
        dateDebutDemande: "05/07/2026", dateFinDemande: "07/07/2026",
        stage: "execution",
        cycles: 1,
        nonConformiteSource: "chantier",
        agentChantier: ["Pierre Lefèvre"],
        materielIds: ["MAT-001", "MAT-005"],
        vehiculeId: "VEH-001",
        dateDebutExec: "20/07/2026", dateFinExec: "21/07/2026 17:00",
        agentBureau: "Nadia Chraibi",
        agentControle: "Julien Faure",
        taches: [{ label: "Rapport de bornage", done: true, agents: ["Nadia Chraibi"] }],
        ref: "LIV-2026-0121",
        cheminBureau: "\\\\SERVEUR\\Projets\\PRJ-2026-008\\bureau\\rapport_v1.pdf",
        dateDebutBureau: "23/07/2026", dateFinBureau: "25/07/2026",
        dateDebutControle: "26/07/2026", dateFinControle: "28/07/2026",
        history: [
          { date: "05/07/2026", label: "Demande reçue", author: "Dispatcher" },
          { date: "07/07/2026", label: "Prestation confirmée", author: "Directrice" },
          { date: "15/07/2026", label: "Affectation : Pierre Lefèvre — visite prévue le 20/07/2026", author: "Dispatcher" },
          { date: "20/07/2026", label: "Passage à l'exécution — visite du 20/07/2026", author: "Pierre Lefèvre" },
          { date: "21/07/2026", label: "Exécution saisie — Bornage réalisé, 14 bornes posées", author: "Pierre Lefèvre" },
          { date: "23/07/2026", label: "Tâches affectées — Rapport de bornage", author: "Nadia Chraibi" },
          { date: "25/07/2026", label: "Traitement bureau terminé — Rapport de bornage", author: "Nadia Chraibi" },
          {
            date: "28/07/2026",
            label: "Non conforme — [Agent Chantier (exécution terrain)] Bornes manquantes sur 2 limites, coordonnées incohérentes avec le plan cadastral. Retour à Exécution.",
            author: "Julien Faure",
          },
        ],
      }),
    ],
  },
];
