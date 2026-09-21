import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Plus,
  MapPin,
  Download,
  ChevronDown,
  Folder,
  AlertTriangle,
} from "lucide-react";
import "./styles/app.css";

import { fadeUpVariants, staggerContainer } from "./lib/motionVariants";
import { STAGES } from "./constants";
import { today, parseDateFR, frToISO } from "./utils/dates";
import { visibleToUser, visibleTabsForRole } from "./utils/access";
import { activeAgentsByRole } from "./utils/employees";
import { buildNotifications } from "./utils/notifications";
import { NAV_ITEMS_FLAT } from "./constants/nav";
import { matchesMateriel, matchesVehicule } from "./utils/stats";
import { nextMaterielId, nextVehiculeId, nextEmployeeId, nextCongeId } from "./utils/ids";
import { downloadFile, buildGeoJSON, buildKML } from "./utils/geo";
import { blankPrestation, blankResource, blankEmployee, blankClient } from "./data/seed";
import { apiGet, apiPost, apiPatch, apiDelete } from "./lib/api";
import { reuseLot } from "./components/cadastre/api";
import { adaptAttachment } from "./lib/apiAdapters";
import { notifyError } from "./utils/notify";
import { adaptClient, adaptEmployee, adaptProjet, adaptResource } from "./lib/apiAdapters";

import ProjetDrawer from "./components/ProjetDrawer";
import PrestationDrawer from "./components/PrestationDrawer";
import ClientDrawer from "./components/ClientDrawer";
import ClientsView from "./components/ClientsView";
import ResourceDrawer from "./components/ResourceDrawer";
import ResourceListView from "./components/ResourceListView";
import EmployeeDrawer from "./components/EmployeeDrawer";
import EmployeeListView from "./components/EmployeeListView";
import MapView from "./components/MapView";
import OverviewDashboard from "./components/OverviewDashboard";
import CalendarView from "./components/CalendarView";
import MiniPipeline from "./components/MiniPipeline";
import ProjetsToolbar from "./components/ProjetsToolbar";
import KanbanBoard from "./components/KanbanBoard";
import NewProjetModal from "./components/modals/NewProjetModal";
import NewClientModal from "./components/modals/NewClientModal";
import NewResourceModal from "./components/modals/NewResourceModal";
import NewEmployeeModal from "./components/modals/NewEmployeeModal";
import AgentChantierApp from "./components/AgentChantierApp";
import AgentBureauApp from "./components/AgentBureauApp";
import AgentControleApp from "./components/AgentControleApp";
import FieldTopstrip from "./components/FieldTopstrip";
import NotificationBell from "./components/NotificationBell";
import CadastreTool from "./components/cadastre/CadastreTool";
import AnalyticsView from "./components/AnalyticsView";
import AppSidebar from "./components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";

// Highest numeric suffix among ids like "PRJ-2026-008" / "CLI-0231" / "PRS-2026-107".
const lastNumber = (ids) =>
  ids.reduce((max, id) => {
    const n = parseInt(String(id).split("-").pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

export default function GlobetudesProjets({ authUser, onLogout }) {
  const [clients, setClients] = useState([]);
  const [materiels, setMateriels] = useState([]);
  const [vehicules, setVehicules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projets, setProjets] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [view, setView] = useState("overview");
  const [openProjetId, setOpenProjetId] = useState(null);
  const [openPrestationId, setOpenPrestationId] = useState(null);
  const [openClientId, setOpenClientId] = useState(null);
  const [openMaterielId, setOpenMaterielId] = useState(null);
  const [openVehiculeId, setOpenVehiculeId] = useState(null);
  const [openEmployeeId, setOpenEmployeeId] = useState(null);
  const [showNewProjet, setShowNewProjet] = useState(false);
  const [newProjetPresetClient, setNewProjetPresetClient] = useState(null);
  const [newProjetPresetLocation, setNewProjetPresetLocation] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewMateriel, setShowNewMateriel] = useState(false);
  const [showNewVehicule, setShowNewVehicule] = useState(false);
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [query, setQuery] = useState("");
  const [currentUser, setCurrentUser] = useState({ role: authUser.role, name: authUser.name });
  const [boardMode, setBoardMode] = useState("list");
  const [filterStage, setFilterStage] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState("recent");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      setDataError("");
      try {
        const [employeesRaw, clientsRaw, resourcesRaw, projetsRaw] = await Promise.all([
          apiGet("/employees/"),
          apiGet("/clients/"),
          apiGet("/resources/"),
          apiGet("/projets/"),
        ]);
        if (cancelled) return;
        const employeesById = Object.fromEntries(employeesRaw.map((e) => [e.id, e]));
        const adaptedProjets = projetsRaw.map((p) => adaptProjet(p, employeesById));

        setEmployees(employeesRaw.map(adaptEmployee));
        setClients(clientsRaw.map(adaptClient));
        setMateriels(resourcesRaw.filter((r) => r.type !== "vehicule").map((r) => adaptResource(r, employeesById)));
        setVehicules(resourcesRaw.filter((r) => r.type === "vehicule").map((r) => adaptResource(r, employeesById)));
        setProjets(adaptedProjets);

        clientSeqRef.current = lastNumber(clientsRaw.map((c) => c.id));
        projetSeqRef.current = lastNumber(projetsRaw.map((p) => p.id));
        prestationSeqRef.current = lastNumber(projetsRaw.flatMap((p) => (p.prestations || []).map((x) => x.id)));
      } catch (err) {
        if (!cancelled) setDataError(err.message || "Impossible de charger les données");
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sequence counters for client/projet/prestation ids, seeded once from the initial state.
  // Unlike materiel/vehicule/employee ids (generated inside their setX(prev => ...) updater,
  // which is race-free), these ids either need to be returned synchronously to a caller in the
  // same tick (createClient, used inline by createProjet) or are simplest to keep symmetric with
  // that pattern (createProjet, addPrestation). Deriving them from `clients.length`/`projets`
  // state directly is racy: two calls in the same tick both read the same stale state and can
  // mint the same id. A ref increments synchronously and independently of React's render/batching,
  // so concurrent calls always get distinct ids.
  // Each ref holds the LAST number used, so the next id is always last + 1.
  const clientSeqRef = useRef(0);
  const projetSeqRef = useRef(0);
  const prestationSeqRef = useRef(0);

  // The counters above are seeded when the page loads, but other sessions (or earlier creations)
  // keep adding rows afterwards. Re-reading the real maxima right before minting an id is what
  // stops two creations from ever picking the same one (which the server rightly refuses).
  const refreshSequences = async () => {
    try {
      const [projetsRaw, clientsRaw] = await Promise.all([apiGet("/projets/"), apiGet("/clients/")]);
      projetSeqRef.current = Math.max(projetSeqRef.current, lastNumber(projetsRaw.map((p) => p.id)));
      clientSeqRef.current = Math.max(clientSeqRef.current, lastNumber(clientsRaw.map((c) => c.id)));
      prestationSeqRef.current = Math.max(
        prestationSeqRef.current,
        lastNumber(projetsRaw.flatMap((p) => (p.prestations || []).map((x) => x.id))),
      );
    } catch {
      // Offline or API hiccup: fall back to the counters we already have.
    }
  };

  const getClient = (id) => clients.find((c) => c.id === id);

  const isPrestationArchived = (p) => p.stage === "livraison" && p.chemin && p.dateLivraison;

  const getProjetStage = (pr) => {
    // A projet with no prestation yet is still at the very start of the pipeline: its Demande.
    if (pr.prestations.length === 0) return STAGES[0].key;
    const active = pr.prestations.filter((p) => !isPrestationArchived(p));
    const pool = active.length > 0 ? active : pr.prestations;
    let earliest = pool[0].stage;
    pool.forEach((p) => {
      if (STAGES.findIndex((s) => s.key === p.stage) < STAGES.findIndex((s) => s.key === earliest)) earliest = p.stage;
    });
    return earliest;
  };

  const roleNameOptions = () => {
    if (["Agent Chantier", "Agent Bureau", "Agent Contrôle"].includes(currentUser.role)) {
      return activeAgentsByRole(employees, currentUser.role).map((e) => e.nom);
    }
    return [];
  };

  const handleRoleChange = (role) => {
    const opts = ["Agent Chantier", "Agent Bureau", "Agent Contrôle"].includes(role)
      ? activeAgentsByRole(employees, role).map((e) => e.nom)
      : [role];
    setCurrentUser({ role, name: opts[0] });
    if (!visibleTabsForRole(role).includes(view)) setView("projets");
  };

  // Frontend prestation patch -> API payload (dates to ISO, agent names to employee ids).
  const empId = (name) => employees.find((e) => e.nom === name)?.id || null;
  const prestationPayload = (patch) => {
    const out = {};
    const map = {
      natureDemandee: "nature_demandee", natureExecutee: "nature_executee",
      dateDebutExec: "date_debut_exec", dateFinExec: "date_fin_exec",
      cheminBureau: "chemin_bureau", ref: "ref", chemin: "chemin", cdN: "cd_n", disqueN: "disque_n",
      stage: "stage", cycles: "cycles", reprogramme: "reprogramme", nonConformiteSource: "non_conformite_source",
    };
    const dates = {
      dateDebutDemande: "date_debut_demande", dateFinDemande: "date_fin_demande",
      dateDebutBureau: "date_debut_bureau", dateFinBureau: "date_fin_bureau",
      dateDebutControle: "date_debut_controle", dateFinControle: "date_fin_controle",
      dateLivraison: "date_livraison",
    };
    for (const [k, v] of Object.entries(patch)) {
      if (map[k]) out[map[k]] = v ?? "";
      else if (dates[k]) out[dates[k]] = frToISO(v);
      else if (k === "agentChantier") out.agent_chantier = (v || []).map(empId).filter(Boolean);
      else if (k === "agentBureau") out.agent_bureau = empId(v);
      else if (k === "agentControle") out.agent_controle = empId(v);
      else if (k === "materielIds") out.materiels = v || [];
      else if (k === "vehiculeId") out.vehicule = v || null;
    }
    return out;
  };

  // Uploads one local attachment (a File, or a network path) and returns the server copy.
  const uploadAttachment = async (kind, objectId, item) => {
    const form = new FormData();
    form.append("content_type_model_input", kind);
    form.append("object_id", objectId);
    form.append("type", item.type || "autre");
    if (item.label) form.append("label", item.label);
    if (item.file) form.append("file", item.file);
    else form.append("chemin", item.chemin || "");
    return adaptAttachment(await apiPost("/attachments/", form));
  };

  // Local items are swapped for their server copy by identity; a failed upload drops the item.
  const replaceProjetAttachment = (projetId, item, saved) =>
    setProjets((prev) =>
      prev.map((pr) =>
        pr.id !== projetId ? pr : { ...pr, attachments: (pr.attachments || []).flatMap((a) => (a === item ? (saved ? [saved] : []) : [a])) }
      )
    );

  const replacePrestationAttachment = (projetId, prestationId, item, saved) =>
    setProjets((prev) =>
      prev.map((pr) =>
        pr.id !== projetId
          ? pr
          : {
              ...pr,
              prestations: pr.prestations.map((p) =>
                p.id !== prestationId ? p : { ...p, attachments: (p.attachments || []).flatMap((a) => (a === item ? (saved ? [saved] : []) : [a])) }
              ),
            }
      )
    );

  // One queue per prestation so quick successive edits reach the server in order.
  const prestationQueueRef = useRef({});
  const enqueue = (prestationId, job) => {
    const prev = prestationQueueRef.current[prestationId] || Promise.resolve();
    const next = prev.then(job, job);
    prestationQueueRef.current[prestationId] = next.catch(() => {});
    return next;
  };

  const persistPrestationPatch = (projetId, before, patch) => {
    enqueue(before.id, async () => {
      try {
        const payload = prestationPayload(patch);
        if (Object.keys(payload).length) await apiPatch(`/prestations/${before.id}/`, payload);
        if (patch.history) {
          for (const h of patch.history.slice((before.history || []).length)) {
            await apiPost("/history/", { prestation: before.id, date: h.date, label: h.label, author: h.author || currentUser?.name || "" });
          }
        }
        if (patch.attachments) {
          const kept = new Set(patch.attachments.map((a) => a.id).filter(Boolean));
          for (const gone of (before.attachments || []).filter((a) => a.id && !kept.has(a.id))) await apiDelete(`/attachments/${gone.id}/`);
          for (const item of patch.attachments.filter((a) => !a.id)) {
            try {
              replacePrestationAttachment(projetId, before.id, item, await uploadAttachment("prestation", before.id, item));
            } catch {
              replacePrestationAttachment(projetId, before.id, item, null);
              notifyError("Une pièce jointe n'a pas pu être téléversée.");
            }
          }
        }
        if (patch.taches) {
          for (const t of before.taches || []) if (typeof t.id === "number") await apiDelete(`/taches/${t.id}/`);
          const saved = [];
          for (const t of patch.taches) {
            const r = await apiPost("/taches/", { prestation: before.id, label: t.label, done: !!t.done, agents: (t.agents || []).map(empId).filter(Boolean) });
            saved.push({ ...t, id: r.id });
          }
          setProjets((prev) =>
            prev.map((pr) => pr.id !== projetId ? pr : { ...pr, prestations: pr.prestations.map((p) => (p.id === before.id ? { ...p, taches: saved } : p)) })
          );
        }
      } catch {
        setProjets((prev) =>
          prev.map((pr) => pr.id !== projetId ? pr : { ...pr, prestations: pr.prestations.map((p) => (p.id === before.id ? before : p)) })
        );
        notifyError("La modification n'a pas pu être enregistrée.");
      }
    });
  };

  const updatePrestation = (projetId, prestationId, patch) => {
    const before = projets.find((pr) => pr.id === projetId)?.prestations.find((p) => p.id === prestationId);
    setProjets((prev) =>
      prev.map((pr) =>
        pr.id !== projetId
          ? pr
          : {
              ...pr,
              prestations: pr.prestations.map((p) => (p.id === prestationId ? { ...p, ...patch } : p)),
            }
      )
    );
    if (before) persistPrestationPatch(projetId, before, patch);
  };

  const findProjetOfPrestation = (prestationId) => projets.find((pr) => pr.prestations.some((p) => p.id === prestationId));

  // Writes go into local state first (the UI stays instant), then to the API. If the server
  // refuses, the local change is rolled back and the user is told, so what is on screen never
  // silently diverges from what is stored.
  const savePrestation = async (projetId, prestation) => {
    try {
      await apiPost("/prestations/", {
        id: prestation.id,
        projet: projetId,
        nature_demandee: prestation.natureDemandee || "",
        date_debut_demande: frToISO(prestation.dateDebutDemande),
        stage: prestation.stage,
      });
      for (const h of prestation.history || []) {
        await apiPost("/history/", { prestation: prestation.id, date: h.date, label: h.label, author: h.author || currentUser?.name || "" });
      }
    } catch {
      setProjets((prev) =>
        prev.map((pr) => (pr.id === projetId ? { ...pr, prestations: pr.prestations.filter((p) => p.id !== prestation.id) } : pr))
      );
      notifyError("La prestation n'a pas pu être enregistrée.");
    }
  };

  const addPrestation = async (projetId, nature) => {
    await refreshSequences();
    prestationSeqRef.current += 1;
    const newId = `PRS-2026-${prestationSeqRef.current}`;
    const newP = blankPrestation({ id: newId, natureDemandee: nature, dateDebutDemande: today() });
    setProjets((prev) =>
      prev.map((pr) => (pr.id === projetId ? { ...pr, prestations: [...pr.prestations, newP] } : pr))
    );
    savePrestation(projetId, newP);
  };

  // A projet created with a brand-new client must wait for that client to exist server-side.
  const clientSavesRef = useRef({});

  const createClient = ({ nom, code, ...rest }) => {
    clientSeqRef.current += 1;
    const id = `CLI-0${clientSeqRef.current}`;
    const client = { id, nom, code: code || id, ...blankClient(rest) };
    setClients((prev) => [...prev, client]);
    const saving = apiPost("/clients/", {
      id,
      nom,
      contact: client.contact || "",
      telephone: client.telephone || "",
      email: client.email || "",
      adresse: client.adresse || "",
      secteur: client.secteur || "",
      notes: client.notes || "",
    });
    clientSavesRef.current[id] = saving;
    saving.catch(() => {
      setClients((prev) => prev.filter((c) => c.id !== id));
      notifyError("Le client n'a pas pu être enregistré.");
    });
    return id;
  };

  const editClient = (clientId, patch) => {
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, ...patch } : c)));
  };

  // Equipment and vehicles share one API resource. Like projets, edits show instantly and are
  // rolled back (with a message) if the server refuses them.
  const resourcePayload = (patch) => {
    const out = {};
    const plain = {
      nom: "nom", type: "type", marque: "marque", modele: "modele", numeroSerie: "numero_serie", status: "status",
      emplacement: "emplacement", valeur: "valeur", fournisseur: "fournisseur",
      assuranceCompagnie: "assurance_compagnie", assurancePolice: "assurance_police", assurancePrime: "assurance_prime",
      carburant: "carburant", carteCarburant: "carte_carburant",
    };
    const dates = {
      derniereCalibration: "derniere_calibration", prochaineCalibration: "prochaine_calibration", dateAchat: "date_achat",
      assuranceDebut: "assurance_debut", assuranceEcheance: "assurance_echeance",
      visiteTechniqueDerniere: "visite_technique_derniere", visiteTechniqueProchaine: "visite_technique_prochaine",
      vignettePaiement: "vignette_paiement", vignetteEcheance: "vignette_echeance",
      kilometrageDate: "kilometrage_date", entretienProchainDate: "entretien_prochain_date",
    };
    const numbers = { kilometrage: "kilometrage", entretienProchainKm: "entretien_prochain_km" };
    for (const [k, v] of Object.entries(patch)) {
      if (plain[k]) out[plain[k]] = v ?? "";
      else if (dates[k]) out[dates[k]] = frToISO(v);
      else if (numbers[k]) out[numbers[k]] = v === "" || v == null ? null : Number(v);
      else if (k === "conducteur") out.conducteur = empId(v);
    }
    return out;
  };

  const saveResource = (kind, id, patch) => {
    const setList = kind === "vehicule" ? setVehicules : setMateriels;
    const list = kind === "vehicule" ? vehicules : materiels;
    const before = list.find((r) => r.id === id);
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const payload = resourcePayload(patch);
    if (!before || !Object.keys(payload).length) return;
    apiPatch(`/resources/${id}/`, payload).catch(() => {
      const restore = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]]));
      setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...restore } : r)));
      notifyError("La modification n'a pas pu être enregistrée.");
    });
  };

  const createResource = (kind, nom) => {
    const setList = kind === "vehicule" ? setVehicules : setMateriels;
    const list = kind === "vehicule" ? vehicules : materiels;
    const id = kind === "vehicule" ? nextVehiculeId(list) : nextMaterielId(list);
    const type = kind === "vehicule" ? "vehicule" : "autre";
    setList((prev) => [...prev, { id, nom, ...blankResource({ type }) }]);
    apiPost("/resources/", { id, nom, type }).catch(() => {
      setList((prev) => prev.filter((r) => r.id !== id));
      notifyError("La ressource n'a pas pu être enregistrée.");
    });
  };

  const addMaintenance = (kind, id, entry) => {
    const setList = kind === "vehicule" ? setVehicules : setMateriels;
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, maintenanceLog: [...(r.maintenanceLog || []), entry] } : r)));
    apiPost("/maintenance-log/", { resource: id, date: frToISO(entry.date), label: entry.label }).catch(() => {
      setList((prev) => prev.map((r) => (r.id === id ? { ...r, maintenanceLog: (r.maintenanceLog || []).filter((e) => e !== entry) } : r)));
      notifyError("L'intervention n'a pas pu être enregistrée.");
    });
  };

  const createMateriel = (nom) => createResource("materiel", nom);
  const renameMateriel = (id, nom) => saveResource("materiel", id, { nom });
  const editMateriel = (id, patch) => saveResource("materiel", id, patch);
  const addMaterielMaintenance = (id, entry) => addMaintenance("materiel", id, entry);

  const addMaterielAttachments = (id, newAttachments) => {
    if (newAttachments.length === 0) return;
    setMateriels((prev) => prev.map((m) => (m.id === id ? { ...m, attachments: [...(m.attachments || []), ...newAttachments] } : m)));
  };

  const removeMaterielAttachment = (id, index) => {
    setMateriels((prev) => prev.map((m) => (m.id === id ? { ...m, attachments: m.attachments.filter((_, i) => i !== index) } : m)));
  };

  const createVehicule = (nom) => createResource("vehicule", nom);
  const renameVehicule = (id, nom) => saveResource("vehicule", id, { nom });
  const editVehicule = (id, patch) => saveResource("vehicule", id, patch);
  const addVehiculeMaintenance = (id, entry) => addMaintenance("vehicule", id, entry);

  const addVehiculeAttachments = (id, newAttachments) => {
    if (newAttachments.length === 0) return;
    setVehicules((prev) => prev.map((v) => (v.id === id ? { ...v, attachments: [...(v.attachments || []), ...newAttachments] } : v)));
  };

  const removeVehiculeAttachment = (id, index) => {
    setVehicules((prev) => prev.map((v) => (v.id === id ? { ...v, attachments: v.attachments.filter((_, i) => i !== index) } : v)));
  };

  const createEmployee = ({ nom, role, poste }) => {
    setEmployees((prev) => [...prev, { id: nextEmployeeId(prev), nom, ...blankEmployee({ role, poste }) }]);
  };

  const renameEmployee = (id, nom) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, nom } : e)));
  };

  const editEmployee = (id, patch) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const addConge = (employeeId, conge) => {
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === employeeId ? { ...e, conges: [...(e.conges || []), { ...conge, id: nextCongeId(e.conges || []) }] } : e
      )
    );
  };

  const updateCongeStatut = (employeeId, congeId, statut) => {
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === employeeId
          ? { ...e, conges: e.conges.map((c) => (c.id === congeId ? { ...c, statut } : c)) }
          : e
      )
    );
  };

  const removeConge = (employeeId, congeId) => {
    setEmployees((prev) =>
      prev.map((e) => (e.id === employeeId ? { ...e, conges: e.conges.filter((c) => c.id !== congeId) } : e))
    );
  };

  const createProjet = async ({ clientId, newClientNom, refFonciere, situation, nature, lat, lng, reuseLotIds = [] }) => {
    await refreshSequences();
    let cid = clientId;
    if (!cid && newClientNom) cid = createClient({ nom: newClientNom });
    projetSeqRef.current += 1;
    const id = `PRJ-2026-${String(projetSeqRef.current).padStart(3, "0")}`;
    // A projet always starts with its first prestation, at the "Demande" stage — that is the
    // pipeline's entry point, so a projet is never left with "0 prestation".
    prestationSeqRef.current += 1;
    const firstPrestation = blankPrestation({
      id: `PRS-2026-${prestationSeqRef.current}`,
      natureDemandee: nature,
      dateDebutDemande: today(),
    });
    const projet = {
      id,
      clientId: cid,
      referenceFonciere: refFonciere,
      situation,
      lat: lat ?? null,
      lng: lng ?? null,
      naturePrestationProjet: nature,
      dateDebut: today(),
      notes: "",
      attachments: [],
      prestations: [firstPrestation],
    };
    setProjets((prev) => [projet, ...prev]);

    (async () => {
      try {
        if (clientSavesRef.current[cid]) await clientSavesRef.current[cid];
        await apiPost("/projets/", {
          id,
          client: cid,
          reference_fonciere: refFonciere,
          situation,
          lat: lat ?? null,
          lng: lng ?? null,
          nature_prestation_projet: nature,
          date_debut: frToISO(projet.dateDebut),
          notes: "",
        });
      } catch {
        setProjets((prev) => prev.filter((pr) => pr.id !== id));
        notifyError("Le projet n'a pas pu être enregistré.");
        return;
      }
      await savePrestation(id, firstPrestation);
      // Earlier surveys the user chose to reuse: attached, or copied when they belong to another projet.
      for (const lotId of reuseLotIds) {
        try {
          await reuseLot(lotId, id);
        } catch {
          notifyError("Un lot n'a pas pu être réutilisé sur ce projet.");
        }
      }
    })();
  };

  const persistProjetPatch = async (projetId, patch) => {
    const before = projets.find((pr) => pr.id === projetId);
    const map = { referenceFonciere: "reference_fonciere", situation: "situation", lat: "lat", lng: "lng", naturePrestationProjet: "nature_prestation_projet", notes: "notes", boundary: "boundary" };
    const payload = {};
    for (const [k, v] of Object.entries(patch)) if (map[k]) payload[map[k]] = v ?? (k === "lat" || k === "lng" || k === "boundary" ? null : "");
    if ("clientId" in patch) payload.client = patch.clientId;
    if ("dateDebut" in patch) payload.date_debut = frToISO(patch.dateDebut);
    if (!before || !Object.keys(payload).length) return;
    try {
      await apiPatch(`/projets/${projetId}/`, payload);
    } catch {
      const restore = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]]));
      setProjets((prev) => prev.map((pr) => (pr.id === projetId ? { ...pr, ...restore } : pr)));
      notifyError("La modification du projet n'a pas pu être enregistrée.");
    }
  };

  const editProjet = (projetId, patch) => {
    setProjets((prev) => prev.map((pr) => (pr.id === projetId ? { ...pr, ...patch } : pr)));
    persistProjetPatch(projetId, patch);
  };

  const updateProjetNotes = (projetId, notes) => {
    setProjets((prev) => prev.map((pr) => (pr.id === projetId ? { ...pr, notes } : pr)));
    persistProjetPatch(projetId, { notes });
  };

  const addProjetAttachments = (projetId, newAttachments) => {
    if (newAttachments.length === 0) return;
    setProjets((prev) =>
      prev.map((pr) => (pr.id === projetId ? { ...pr, attachments: [...(pr.attachments || []), ...newAttachments] } : pr))
    );
    newAttachments.forEach(async (item) => {
      try {
        replaceProjetAttachment(projetId, item, await uploadAttachment("projet", projetId, item));
      } catch {
        replaceProjetAttachment(projetId, item, null);
        notifyError("Une pièce jointe n'a pas pu être téléversée.");
      }
    });
  };

  const removeProjetAttachment = (projetId, index) => {
    const removed = projets.find((pr) => pr.id === projetId)?.attachments?.[index];
    setProjets((prev) =>
      prev.map((pr) =>
        pr.id === projetId ? { ...pr, attachments: pr.attachments.filter((_, i) => i !== index) } : pr
      )
    );
    if (removed?.id) apiDelete(`/attachments/${removed.id}/`).catch(() => notifyError("La pièce jointe n'a pas pu être supprimée."));
  };

  const filteredProjets = useMemo(() => {
    return projets
      .map((pr) => ({ ...pr, prestations: pr.prestations.filter((p) => visibleToUser(p, currentUser)) }))
      .filter((pr) => pr.prestations.length > 0 || currentUser.role === "Dispatcher" || currentUser.role === "Directrice")
      .filter((pr) => {
        if (!query) return true;
        const client = getClient(pr.clientId);
        const q = query.toLowerCase();
        return (
          (client?.nom || "").toLowerCase().includes(q) ||
          (client?.code || "").toLowerCase().includes(q) ||
          pr.id.toLowerCase().includes(q) ||
          pr.referenceFonciere.toLowerCase().includes(q)
        );
      });
  }, [projets, query, currentUser, clients]);

  const visibleProjets = useMemo(() => {
    const from = dateFrom ? parseDateFR(dateFrom) : null;
    const to = dateTo ? parseDateFR(dateTo) : null;
    const filtered = filteredProjets.filter((pr) => {
      if (filterStage === "nonconforme") {
        if (!pr.prestations.some((p) => p.cycles > 0 && (p.stage !== "livraison" || !p.chemin))) return false;
      } else if (filterStage !== "all" && !pr.prestations.some((p) => p.stage === filterStage)) return false;
      if (filterClient !== "all" && pr.clientId !== filterClient) return false;
      if (filterAgent !== "all" && !pr.prestations.some((p) => (p.agentChantier || []).includes(filterAgent))) return false;
      const debut = parseDateFR(pr.dateDebut);
      if (from != null && (debut == null || debut < from)) return false;
      if (to != null && (debut == null || debut > to)) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sortKey === "recent") sorted.sort((a, b) => (parseDateFR(b.dateDebut) || 0) - (parseDateFR(a.dateDebut) || 0));
    else if (sortKey === "ancien") sorted.sort((a, b) => (parseDateFR(a.dateDebut) || 0) - (parseDateFR(b.dateDebut) || 0));
    else if (sortKey === "client") sorted.sort((a, b) => (getClient(a.clientId)?.nom || "").localeCompare(getClient(b.clientId)?.nom || ""));
    else if (sortKey === "prestations") sorted.sort((a, b) => b.prestations.length - a.prestations.length);
    return sorted;
  }, [filteredProjets, filterStage, filterClient, filterAgent, dateFrom, dateTo, sortKey, clients]);

  const allPrestationsFlat = useMemo(() => {
    const rows = [];
    projets.forEach((pr) => {
      pr.prestations.forEach((p) => {
        if (visibleToUser(p, currentUser)) rows.push({ ...p, projet: pr });
      });
    });
    return rows;
  }, [projets, currentUser]);

  const exportCSV = () => {
    const headers = [
      "Projet", "Client", "Code client", "Réf foncière", "Prestation ID", "Nature demandée", "Nature exécutée",
      "Agent chantier", "Matériel", "Véhicule", "Agent bureau", "Agent contrôle", "Étape", "Non-conformités",
      "Date livraison", "Chemin", "CD N", "Disque N",
    ];
    const rows = allPrestationsFlat.map((p) => {
      const client = getClient(p.projet.clientId);
      const materielNoms = (p.materielIds || []).map((id) => materiels.find((m) => m.id === id)?.nom).filter(Boolean).join(", ");
      const vehiculeNom = vehicules.find((v) => v.id === p.vehiculeId)?.nom || "";
      return [
        p.projet.id, client?.nom || "", client?.code || "", p.projet.referenceFonciere, p.id,
        p.natureDemandee, p.natureExecutee, (p.agentChantier || []).join(", "), materielNoms,
        vehiculeNom, p.agentBureau, p.agentControle, STAGES.find((s) => s.key === p.stage).label, p.cycles,
        p.dateLivraison, p.chemin, p.cdN, p.disqueN,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadFile(`globetudes-prestations-${today().split("/").join("-")}.csv`, "﻿" + csv, "text/csv");
  };

  const exportGeoJSON = () => {
    downloadFile(`globetudes-projets-${today().split("/").join("-")}.geojson`, buildGeoJSON(filteredProjets, getClient), "application/geo+json");
  };

  const exportKML = () => {
    downloadFile(`globetudes-projets-${today().split("/").join("-")}.kml`, buildKML(filteredProjets, getClient), "application/vnd.google-earth.kml+xml");
  };

  const openProjet = projets.find((pr) => pr.id === openProjetId);
  const openPrestationCtx = openPrestationId
    ? { projet: findProjetOfPrestation(openPrestationId), prestation: findProjetOfPrestation(openPrestationId)?.prestations.find((p) => p.id === openPrestationId) }
    : null;
  const openClient = openClientId ? getClient(openClientId) : null;
  const openMateriel = openMaterielId ? materiels.find((m) => m.id === openMaterielId) : null;
  const openVehicule = openVehiculeId ? vehicules.find((v) => v.id === openVehiculeId) : null;
  const openEmployee = openEmployeeId ? employees.find((e) => e.id === openEmployeeId) : null;

  const isOffice = currentUser.role === "Dispatcher" || currentUser.role === "Directrice";
  const visibleTabs = visibleTabsForRole(currentUser.role);

  const stats = useMemo(() => {
    const total = allPrestationsFlat.length;
    const enCours = allPrestationsFlat.filter((p) => p.stage !== "livraison" || !p.chemin).length;
    const nonConf = allPrestationsFlat.filter((p) => p.cycles > 0).length;
    const livres = allPrestationsFlat.filter((p) => p.stage === "livraison" && p.chemin).length;
    return { total, enCours, nonConf, livres };
  }, [allPrestationsFlat]);

  // The one genuinely-important auto-surfaced alert for the insight card: visits that were
  // scheduled but never started, not decorative — hidden entirely when there's nothing to flag.
  const enRetardCount = useMemo(() => {
    const now = parseDateFR(today());
    return allPrestationsFlat.filter((p) => p.stage === "affectation" && (parseDateFR(p.dateDebutExec) ?? Infinity) < now).length;
  }, [allPrestationsFlat]);

  const officeNotifications = useMemo(
    () => buildNotifications(currentUser, { tasks: allPrestationsFlat, employees, materiels, vehicules, getClient }),
    [currentUser, allPrestationsFlat, employees, materiels, vehicules, clients]
  );

  const handleOpenNotification = (n) => {
    if (n.prestationId) setOpenPrestationId(n.prestationId);
    else if (n.employeeId) setOpenEmployeeId(n.employeeId);
    else if (n.materielId) setOpenMaterielId(n.materielId);
    else if (n.vehiculeId) setOpenVehiculeId(n.vehiculeId);
  };

  const searchPlaceholder = {
    projets: "Client, projet, réf. foncière...",
    clients: "Nom ou code client...",
    materiels: "Nom ou code matériel...",
    vehicules: "Nom ou immatriculation...",
    employes: "Nom ou code employé...",
    carte: "Client, projet, réf. foncière...",
    calendrier: "Client, projet, réf. foncière...",
  }[view];

  if (dataLoading || dataError) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
        {dataError ? (
          <>
            <div>Impossible de charger les données : {dataError}</div>
            <button className="gt-newbtn" onClick={onLogout}>Se reconnecter</button>
          </>
        ) : (
          <div>Chargement...</div>
        )}
      </div>
    );
  }

  if (currentUser.role === "Agent Chantier") {
    return (
      <div className="ac-shell">
        <Toaster />
        <FieldTopstrip
          currentUser={currentUser}
          nameOptions={roleNameOptions()}
          onRoleChange={handleRoleChange}
          onNameChange={(name) => setCurrentUser({ role: currentUser.role, name })}
          onLogout={onLogout}
        />
        <AgentChantierApp
          currentUser={currentUser}
          tasks={allPrestationsFlat}
          projects={filteredProjets}
          materiels={materiels}
          vehicules={vehicules}
          getClient={getClient}
          onUpdatePrestation={(prestationId, patch) => {
            const projetId = findProjetOfPrestation(prestationId)?.id;
            if (projetId) updatePrestation(projetId, prestationId, patch);
          }}
        />
      </div>
    );
  }

  if (currentUser.role === "Agent Bureau") {
    return (
      <div className="ab-shell">
        <Toaster />
        <FieldTopstrip
          currentUser={currentUser}
          nameOptions={roleNameOptions()}
          onRoleChange={handleRoleChange}
          onNameChange={(name) => setCurrentUser({ role: currentUser.role, name })}
          onLogout={onLogout}
        />
        <AgentBureauApp
          currentUser={currentUser}
          tasks={allPrestationsFlat}
          materiels={materiels}
          vehicules={vehicules}
          employees={employees}
          allProjets={projets}
          getClient={getClient}
          onUpdatePrestation={(prestationId, patch) => {
            const projetId = findProjetOfPrestation(prestationId)?.id;
            if (projetId) updatePrestation(projetId, prestationId, patch);
          }}
        />
      </div>
    );
  }

  if (currentUser.role === "Agent Contrôle") {
    return (
      <div className="ab-shell">
        <Toaster />
        <FieldTopstrip
          currentUser={currentUser}
          nameOptions={roleNameOptions()}
          onRoleChange={handleRoleChange}
          onNameChange={(name) => setCurrentUser({ role: currentUser.role, name })}
          onLogout={onLogout}
        />
        <AgentControleApp
          currentUser={currentUser}
          tasks={allPrestationsFlat}
          materiels={materiels}
          vehicules={vehicules}
          employees={employees}
          allProjets={projets}
          getClient={getClient}
          onUpdatePrestation={(prestationId, patch) => {
            const projetId = findProjetOfPrestation(prestationId)?.id;
            if (projetId) updatePrestation(projetId, prestationId, patch);
          }}
        />
      </div>
    );
  }

  const activeNavItem = NAV_ITEMS_FLAT.find((item) => item.key === view);

  return (
    <SidebarProvider>
      <AppSidebar
        visibleTabs={visibleTabs}
        view={view}
        setView={setView}
        currentUser={currentUser}
        onRoleChange={handleRoleChange}
        onLogout={onLogout}
      />
      <SidebarInset className="gt-app">
      <Toaster />
      <div className="gt-topbar">
        <div className="gt-topbar-title">
          <SidebarTrigger />
          <div className="gt-topbar-titlesep" />
          {activeNavItem && (
            <span className="gt-sidebar-icon gt-topbar-titleicon" style={{ "--icon-color": activeNavItem.color }}>
              <activeNavItem.icon size={15} />
            </span>
          )}
          <span className="gt-topbar-titletext">{activeNavItem?.label || ""}</span>
        </div>

        <div className="gt-topbar-right">
          <NotificationBell notifications={officeNotifications} onOpen={handleOpenNotification} />
          {view !== "overview" && view !== "cadastre" && view !== "analytics" && (
            <div className="gt-search">
              <Search size={14} color="#9A9C92" />
              <input placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
          {view === "projets" && isOffice && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-auto py-2">
                  <Download size={15} /> Exporter <ChevronDown size={13} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportCSV}>CSV (prestations)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportGeoJSON}>GeoJSON (projets géolocalisés)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportKML}>KML (projets géolocalisés)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {view === "projets" && isOffice && (
            <button className="gt-newbtn" onClick={() => { setNewProjetPresetClient(null); setShowNewProjet(true); }}>
              <Plus size={15} /> Nouveau projet
            </button>
          )}
          {view === "clients" && isOffice && (
            <button className="gt-newbtn" onClick={() => setShowNewClient(true)}>
              <Plus size={15} /> Nouveau client
            </button>
          )}
          {view === "materiels" && isOffice && (
            <button className="gt-newbtn" onClick={() => setShowNewMateriel(true)}>
              <Plus size={15} /> Nouveau matériel
            </button>
          )}
          {view === "vehicules" && isOffice && (
            <button className="gt-newbtn" onClick={() => setShowNewVehicule(true)}>
              <Plus size={15} /> Nouveau véhicule
            </button>
          )}
          {view === "employes" && isOffice && (
            <button className="gt-newbtn" onClick={() => setShowNewEmployee(true)}>
              <Plus size={15} /> Nouvel employé
            </button>
          )}
        </div>
      </div>

      {view === "projets" && enRetardCount > 0 && (
        <div className="gt-pagepad">
          <div className="gt-insight-card">
            <div className="gt-insight-icon"><AlertTriangle size={18} /></div>
            <div className="gt-insight-body">
              <div className="gt-insight-title">{enRetardCount} prestation{enRetardCount > 1 ? "s" : ""} en retard cette semaine</div>
              <div className="gt-insight-sub">Visite terrain prévue non démarrée — affectation à revoir</div>
            </div>
          </div>
        </div>
      )}

      {view === "projets" && (
        <motion.div className="gt-stats" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="gt-stat gt-card">
            <div className="gt-stat-label">Prestations visibles</div>
            <div className="gt-stat-num">{stats.total}</div>
          </div>
          <div className="gt-stat gt-card">
            <div className="gt-stat-label">En cours</div>
            <div className="gt-stat-num">{stats.enCours}</div>
            <span className="gt-status-pill info"><span className="gt-status-pill-dot" />En cours</span>
          </div>
          <div className="gt-stat gt-card">
            <div className="gt-stat-label">Avec non-conformité</div>
            <div className="gt-stat-num">{stats.nonConf}</div>
            <span className={`gt-status-pill ${stats.nonConf > 0 ? "danger" : "neutral"}`}>
              <span className="gt-status-pill-dot" />{stats.nonConf > 0 ? "À traiter" : "Aucune"}
            </span>
          </div>
          <div className="gt-stat gt-card">
            <div className="gt-stat-label">Livrées</div>
            <div className="gt-stat-num">{stats.livres}</div>
            <span className="gt-status-pill success"><span className="gt-status-pill-dot" />Conforme</span>
          </div>
        </motion.div>
      )}

      {view === "projets" && (
        <ProjetsToolbar
          clients={clients}
          agents={activeAgentsByRole(employees, "Agent Chantier").map((e) => e.nom)}
          filterStage={filterStage}
          setFilterStage={setFilterStage}
          filterClient={filterClient}
          setFilterClient={setFilterClient}
          filterAgent={filterAgent}
          setFilterAgent={setFilterAgent}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          sortKey={sortKey}
          setSortKey={setSortKey}
          boardMode={boardMode}
          setBoardMode={setBoardMode}
        />
      )}

      <AnimatePresence mode="wait">
        {view === "overview" && (
          <motion.div className="gt-listpage" key="overview" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <OverviewDashboard
              projets={projets}
              allPrestationsFlat={allPrestationsFlat}
              materiels={materiels}
              vehicules={vehicules}
              employees={employees}
              getClient={getClient}
              enRetardCount={enRetardCount}
              onOpenMateriel={setOpenMaterielId}
              onOpenVehicule={setOpenVehiculeId}
              onOpenEmployee={setOpenEmployeeId}
              onOpenClient={setOpenClientId}
              onOpenPrestation={setOpenPrestationId}
              onGo={(v, filter) => {
                if (v === "projets") {
                  setBoardMode("list");
                  setFilterStage(filter?.stage || "all");
                }
                setView(v);
              }}
              userName={currentUser.name}
            />
          </motion.div>
        )}

        {view === "projets" && boardMode === "kanban" && (
          <KanbanBoard
            key="projets-kanban"
            projects={visibleProjets}
            getClient={getClient}
            onOpenProjet={setOpenProjetId}
            getProjetStage={getProjetStage}
          />
        )}

        {view === "projets" && boardMode === "list" && (
          <motion.div
            className="gt-projets"
            key="projets"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
          >
            {visibleProjets.map((pr) => {
              const client = getClient(pr.clientId);
              return (
                <motion.div
                  className="gt-projetcard"
                  key={pr.id}
                  variants={fadeUpVariants}
                  onClick={() => setOpenProjetId(pr.id)}
                  whileHover={{ y: -2 }}
                >
                  <div className="gt-projetcard-top">
                    <span className="gt-projetcard-id gt-mono">{pr.id}</span>
                    <span className="gt-projetcard-id gt-mono">{pr.referenceFonciere}</span>
                  </div>
                  <div className="gt-projetcard-client">{client?.nom || "—"}</div>
                  <div className="gt-projetcard-meta">
                    <span><MapPin size={12} style={{ verticalAlign: -2 }} /> {pr.situation}</span>
                    <span><Folder size={12} style={{ verticalAlign: -2 }} /> {pr.naturePrestationProjet}</span>
                    <span>{pr.prestations.length} prestation{pr.prestations.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="gt-projetcard-prestlist">
                    {pr.prestations.map((p) => (
                      <div className="gt-projetcard-prestrow" key={p.id}>
                        <span className="gt-projetcard-prest-label">{p.natureDemandee || "Non définie"}</span>
                        <MiniPipeline stage={p.stage} />
                        <span className="gt-projetcard-prest-stage">{STAGES.find((s) => s.key === p.stage).label}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
            {visibleProjets.length === 0 && <div className="gt-list-empty">Aucun projet ne correspond.</div>}
          </motion.div>
        )}

        {view === "clients" && (
          <motion.div className="gt-listpage" key="clients" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <ClientsView
              clients={clients}
              projects={filteredProjets}
              query={query}
              onOpenClient={setOpenClientId}
              isOffice={isOffice}
            />
          </motion.div>
        )}

        {view === "materiels" && (
          <motion.div className="gt-listpage" key="materiels" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <ResourceListView
              items={materiels}
              projects={filteredProjets}
              matches={matchesMateriel}
              query={query}
              onOpenItem={setOpenMaterielId}
              emptyLabel="Aucun matériel ne correspond."
            />
          </motion.div>
        )}

        {view === "vehicules" && (
          <motion.div className="gt-listpage" key="vehicules" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <ResourceListView
              items={vehicules}
              projects={filteredProjets}
              matches={matchesVehicule}
              query={query}
              onOpenItem={setOpenVehiculeId}
              emptyLabel="Aucun véhicule ne correspond."
            />
          </motion.div>
        )}

        {view === "employes" && (
          <motion.div className="gt-listpage" key="employes" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <EmployeeListView
              items={employees}
              projects={filteredProjets}
              query={query}
              onOpenItem={setOpenEmployeeId}
            />
          </motion.div>
        )}

        {view === "carte" && (
          <motion.div
            key="carte"
            style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
          >
            <MapView
              projects={filteredProjets}
              getClient={getClient}
              onOpenProjet={setOpenProjetId}
              onCreateProjetAt={(lat, lng, situation) => {
                setNewProjetPresetClient(null);
                setNewProjetPresetLocation({ lat, lng, situation });
                setShowNewProjet(true);
              }}
            />
          </motion.div>
        )}

        {view === "analytics" && (
          <motion.div key="analytics" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <AnalyticsView projets={projets} employees={employees} getClient={getClient} />
          </motion.div>
        )}

        {view === "cadastre" && (
          <motion.div key="cadastre" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <CadastreTool projets={projets} currentUser={currentUser} />
          </motion.div>
        )}

        {view === "calendrier" && (
          <motion.div
            key="calendrier"
            style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
          >
            <CalendarView projects={filteredProjets} employees={employees} getClient={getClient} onOpenPrestation={setOpenPrestationId} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openProjet && (
          <ProjetDrawer
            key={openProjet.id}
            projet={openProjet}
            client={getClient(openProjet.clientId)}
            materiels={materiels}
            vehicules={vehicules}
            onClose={() => setOpenProjetId(null)}
            onOpenPrestation={(id) => {
              setOpenProjetId(null);
              setOpenPrestationId(id);
            }}
            onAddPrestation={addPrestation}
            onOpenClient={isOffice ? (clientId) => {
              setOpenProjetId(null);
              setOpenClientId(clientId);
            } : undefined}
            onGoCadastre={isOffice ? () => {
              setOpenProjetId(null);
              setView("cadastre");
            } : undefined}
            onEditProjet={editProjet}
            onUpdateNotes={updateProjetNotes}
            onAddAttachments={addProjetAttachments}
            onRemoveAttachment={removeProjetAttachment}
            currentUser={currentUser}
            isOffice={isOffice}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openPrestationCtx?.prestation && (
          <PrestationDrawer
            key={openPrestationCtx.prestation.id}
            projet={openPrestationCtx.projet}
            client={getClient(openPrestationCtx.projet.clientId)}
            prestation={openPrestationCtx.prestation}
            materiels={materiels}
            vehicules={vehicules}
            employees={employees}
            allProjets={projets}
            onClose={() => setOpenPrestationId(null)}
            onUpdate={(id, patch) => updatePrestation(openPrestationCtx.projet.id, id, patch)}
            onOpenMateriel={(id) => {
              setOpenPrestationId(null);
              setOpenMaterielId(id);
            }}
            onOpenVehicule={(id) => {
              setOpenPrestationId(null);
              setOpenVehiculeId(id);
            }}
            currentUser={currentUser}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openClient && (
          <ClientDrawer
            key={openClient.id}
            client={openClient}
            projects={projets}
            onClose={() => setOpenClientId(null)}
            onOpenProjet={(id) => {
              setOpenClientId(null);
              setOpenProjetId(id);
            }}
            onNewProjetForClient={(client) => {
              setOpenClientId(null);
              setNewProjetPresetClient(client);
              setShowNewProjet(true);
            }}
            onEditClient={editClient}
            isOffice={isOffice}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openMateriel && (
          <ResourceDrawer
            key={openMateriel.id}
            item={openMateriel}
            projects={projets}
            matches={matchesMateriel}
            typeLabel="Matériel"
            onClose={() => setOpenMaterielId(null)}
            onOpenPrestation={(id) => {
              setOpenMaterielId(null);
              setOpenPrestationId(id);
            }}
            onRenameItem={renameMateriel}
            onEditItem={editMateriel}
            onAddMaintenance={addMaterielMaintenance}
            onAddAttachments={addMaterielAttachments}
            onRemoveAttachment={removeMaterielAttachment}
            currentUser={currentUser}
            isOffice={isOffice}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openVehicule && (
          <ResourceDrawer
            key={openVehicule.id}
            item={openVehicule}
            projects={projets}
            employees={employees}
            matches={matchesVehicule}
            typeLabel="Véhicule"
            onClose={() => setOpenVehiculeId(null)}
            onOpenPrestation={(id) => {
              setOpenVehiculeId(null);
              setOpenPrestationId(id);
            }}
            onRenameItem={renameVehicule}
            onEditItem={editVehicule}
            onAddMaintenance={addVehiculeMaintenance}
            onAddAttachments={addVehiculeAttachments}
            onRemoveAttachment={removeVehiculeAttachment}
            currentUser={currentUser}
            isOffice={isOffice}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openEmployee && (
          <EmployeeDrawer
            key={openEmployee.id}
            item={openEmployee}
            projects={projets}
            onClose={() => setOpenEmployeeId(null)}
            onOpenPrestation={(id) => {
              setOpenEmployeeId(null);
              setOpenPrestationId(id);
            }}
            onRenameItem={renameEmployee}
            onEditItem={editEmployee}
            onAddConge={addConge}
            onUpdateCongeStatut={updateCongeStatut}
            onRemoveConge={removeConge}
            isOffice={isOffice}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewProjet && (
          <NewProjetModal
            key="new-projet-modal"
            onClose={() => { setShowNewProjet(false); setNewProjetPresetClient(null); setNewProjetPresetLocation(null); }}
            onCreate={createProjet}
            clients={clients}
            presetClient={newProjetPresetClient}
            presetLocation={newProjetPresetLocation}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewClient && (
          <NewClientModal
            key="new-client-modal"
            onClose={() => setShowNewClient(false)}
            onCreate={createClient}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewMateriel && (
          <NewResourceModal
            key="new-materiel-modal"
            title="Nouveau matériel"
            label="Désignation du matériel"
            placeholder="ex. Théodolite"
            onClose={() => setShowNewMateriel(false)}
            onCreate={createMateriel}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewVehicule && (
          <NewResourceModal
            key="new-vehicule-modal"
            title="Nouveau véhicule"
            label="Véhicule (type — immatriculation)"
            placeholder="ex. Pick-up — 33210-A-6"
            onClose={() => setShowNewVehicule(false)}
            onCreate={createVehicule}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewEmployee && (
          <NewEmployeeModal
            key="new-employee-modal"
            onClose={() => setShowNewEmployee(false)}
            onCreate={createEmployee}
          />
        )}
      </AnimatePresence>
      </SidebarInset>
    </SidebarProvider>
  );
}
