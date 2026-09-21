import { isoToFR } from "../utils/dates";

// Converts the snake_case, FK-id-based JSON returned by the Django API into the exact
// camelCase shapes the frontend already works with (see data/seed.js blank* factories), so
// none of the existing view/drawer components need to change.

export const adaptClient = (c) => ({
  id: c.id,
  nom: c.nom,
  code: c.id,
  contact: c.contact || "",
  telephone: c.telephone || "",
  email: c.email || "",
  adresse: c.adresse || "",
  secteur: c.secteur || "",
  notes: c.notes || "",
});

export const adaptEmployee = (e) => ({
  id: e.id,
  nom: e.nom,
  role: e.role,
  poste: e.poste || "",
  telephone: e.telephone || "",
  email: e.email || "",
  dateEmbauche: isoToFR(e.date_embauche),
  status: e.status,
  notes: e.notes || "",
  conges: (e.conges || []).map((c) => ({
    id: c.id,
    type: c.type,
    dateDebut: isoToFR(c.date_debut),
    dateFin: isoToFR(c.date_fin),
    statut: c.statut,
    motif: c.motif || "",
  })),
});

const numOrEmpty = (v) => (v == null ? "" : v);

export const adaptResource = (r, employeesById = {}) => ({
  id: r.id,
  nom: r.nom,
  type: r.type,
  marque: r.marque || "",
  modele: r.modele || "",
  numeroSerie: r.numero_serie || "",
  status: r.status,
  derniereCalibration: isoToFR(r.derniere_calibration),
  prochaineCalibration: isoToFR(r.prochaine_calibration),
  emplacement: r.emplacement || "",
  dateAchat: isoToFR(r.date_achat),
  valeur: r.valeur || "",
  fournisseur: r.fournisseur || "",
  assuranceCompagnie: r.assurance_compagnie || "",
  assurancePolice: r.assurance_police || "",
  assuranceDebut: isoToFR(r.assurance_debut),
  assuranceEcheance: isoToFR(r.assurance_echeance),
  assurancePrime: r.assurance_prime || "",
  visiteTechniqueDerniere: isoToFR(r.visite_technique_derniere),
  visiteTechniqueProchaine: isoToFR(r.visite_technique_prochaine),
  vignettePaiement: isoToFR(r.vignette_paiement),
  vignetteEcheance: isoToFR(r.vignette_echeance),
  kilometrage: numOrEmpty(r.kilometrage),
  kilometrageDate: isoToFR(r.kilometrage_date),
  entretienProchainDate: isoToFR(r.entretien_prochain_date),
  entretienProchainKm: numOrEmpty(r.entretien_prochain_km),
  carburant: r.carburant || "",
  carteCarburant: r.carte_carburant || "",
  conducteur: r.conducteur ? employeesById[r.conducteur]?.nom || "" : "",
  sortieCourante: r.sortie_courante
    ? { parNom: r.sortie_courante.par_nom, at: r.sortie_courante.at, note: r.sortie_courante.note || "", kilometrage: r.sortie_courante.kilometrage }
    : null,
  maintenanceLog: (r.maintenance_log || []).map((m) => ({
    id: m.id,
    date: isoToFR(m.date),
    label: m.label,
  })),
  attachments: [],
});

// agent_chantier/agent_bureau/agent_controle on the backend are employee ids (FKs); the
// frontend keeps agent *names* on prestations instead, so every adapter below needs a lookup
// map (id -> nom) built from the already-fetched employees list.
const employeeName = (employeesById, id) => (id ? employeesById[id]?.nom || id : "");

const adaptTache = (t, employeesById) => ({
  id: t.id,
  label: t.label,
  done: t.done,
  agents: (t.agents || []).map((id) => employeeName(employeesById, id)),
});

const adaptHistoryEntry = (h) => ({
  date: h.date,
  label: h.label,
  author: h.author || "",
});

// Server attachment -> the shape the drawers already render (name/size/author/date, or a network path).
export const adaptAttachment = (a) => ({
  id: a.id,
  label: a.label || undefined,
  type: a.type,
  name: a.name || undefined,
  size: a.size || 0,
  chemin: a.chemin || undefined,
  url: a.file || "",
  author: a.author || "",
  date: isoToFR((a.uploaded_at || "").slice(0, 10)),
});

export const adaptPrestation = (p, employeesById) => ({
  id: p.id,
  natureDemandee: p.nature_demandee || "",
  natureExecutee: p.nature_executee || "",
  dateDebutDemande: isoToFR(p.date_debut_demande),
  dateFinDemande: isoToFR(p.date_fin_demande),
  agentChantier: (p.agent_chantier || []).map((id) => employeeName(employeesById, id)),
  materielIds: p.materiels || [],
  vehiculeId: p.vehicule || "",
  dateDebutExec: p.date_debut_exec || "",
  dateFinExec: p.date_fin_exec || "",
  agentBureau: employeeName(employeesById, p.agent_bureau),
  taches: (p.taches || []).map((t) => adaptTache(t, employeesById)),
  cheminBureau: p.chemin_bureau || "",
  dateDebutBureau: isoToFR(p.date_debut_bureau),
  dateFinBureau: isoToFR(p.date_fin_bureau),
  agentControle: employeeName(employeesById, p.agent_controle),
  dateDebutControle: isoToFR(p.date_debut_controle),
  dateFinControle: isoToFR(p.date_fin_controle),
  dateLivraison: isoToFR(p.date_livraison),
  ref: p.ref || "",
  chemin: p.chemin || "",
  cdN: p.cd_n || "",
  disqueN: p.disque_n || "",
  stage: p.stage,
  cycles: p.cycles || 0,
  reprogramme: p.reprogramme || false,
  nonConformiteSource: p.non_conformite_source || "",
  attachments: (p.attachments || []).map(adaptAttachment),
  history: (p.history || []).map(adaptHistoryEntry),
});

export const adaptProjet = (pr, employeesById) => ({
  id: pr.id,
  clientId: pr.client,
  referenceFonciere: pr.reference_fonciere || "",
  situation: pr.situation || "",
  lat: pr.lat,
  lng: pr.lng,
  naturePrestationProjet: pr.nature_prestation_projet || "",
  dateDebut: isoToFR(pr.date_debut),
  notes: pr.notes || "",
  boundary: pr.boundary || null,
  attachments: (pr.attachments || []).map(adaptAttachment),
  prestations: (pr.prestations || []).map((p) => adaptPrestation(p, employeesById)),
});
