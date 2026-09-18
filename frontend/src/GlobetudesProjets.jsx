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
import { today, parseDateFR } from "./utils/dates";
import { visibleToUser, visibleTabsForRole } from "./utils/access";
import { activeAgentsByRole } from "./utils/employees";
import { buildNotifications } from "./utils/notifications";
import { NAV_ITEMS_FLAT } from "./constants/nav";
import { matchesMateriel, matchesVehicule } from "./utils/stats";
import { nextMaterielId, nextVehiculeId, nextPrestationId, nextEmployeeId, nextCongeId } from "./utils/ids";
import { downloadFile, buildGeoJSON, buildKML } from "./utils/geo";
import { blankPrestation, blankResource, blankEmployee, blankClient } from "./data/seed";
import { apiGet } from "./lib/api";
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
        setMateriels(resourcesRaw.filter((r) => r.type !== "vehicule").map(adaptResource));
        setVehicules(resourcesRaw.filter((r) => r.type === "vehicule").map(adaptResource));
        setProjets(adaptedProjets);

        clientSeqRef.current = clientsRaw.length;
        projetSeqRef.current = projetsRaw.length;
        prestationSeqRef.current = parseInt(nextPrestationId(adaptedProjets).split("-").pop(), 10) - 1;
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
  const clientSeqRef = useRef(clients.length);
  const projetSeqRef = useRef(projets.length);
  const prestationSeqRef = useRef(parseInt(nextPrestationId(projets).split("-").pop(), 10) - 1);

  const getClient = (id) => clients.find((c) => c.id === id);

  const isPrestationArchived = (p) => p.stage === "livraison" && p.chemin && p.dateLivraison;

  const getProjetStage = (pr) => {
    if (pr.prestations.length === 0) return null;
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

  const updatePrestation = (projetId, prestationId, patch) => {
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
  };

  const findProjetOfPrestation = (prestationId) => projets.find((pr) => pr.prestations.some((p) => p.id === prestationId));

  const addPrestation = (projetId, nature) => {
    prestationSeqRef.current += 1;
    const newId = `PRS-2026-0${prestationSeqRef.current}`;
    setProjets((prev) =>
      prev.map((pr) => {
        if (pr.id !== projetId) return pr;
        const newP = blankPrestation({ id: newId, natureDemandee: nature });
        return { ...pr, prestations: [...pr.prestations, newP] };
      })
    );
  };

  const createClient = ({ nom, code, ...rest }) => {
    const id = `CLI-0${240 + clientSeqRef.current}`;
    clientSeqRef.current += 1;
    setClients((prev) => [...prev, { id, nom, code: code || id, ...blankClient(rest) }]);
    return id;
  };

  const editClient = (clientId, patch) => {
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, ...patch } : c)));
  };

  const createMateriel = (nom) => {
    setMateriels((prev) => [...prev, { id: nextMaterielId(prev), nom, ...blankResource() }]);
  };

  const renameMateriel = (id, nom) => {
    setMateriels((prev) => prev.map((m) => (m.id === id ? { ...m, nom } : m)));
  };

  const editMateriel = (id, patch) => {
    setMateriels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const addMaterielMaintenance = (id, entry) => {
    setMateriels((prev) => prev.map((m) => (m.id === id ? { ...m, maintenanceLog: [...(m.maintenanceLog || []), entry] } : m)));
  };

  const addMaterielAttachments = (id, newAttachments) => {
    if (newAttachments.length === 0) return;
    setMateriels((prev) => prev.map((m) => (m.id === id ? { ...m, attachments: [...(m.attachments || []), ...newAttachments] } : m)));
  };

  const removeMaterielAttachment = (id, index) => {
    setMateriels((prev) => prev.map((m) => (m.id === id ? { ...m, attachments: m.attachments.filter((_, i) => i !== index) } : m)));
  };

  const createVehicule = (nom) => {
    setVehicules((prev) => [...prev, { id: nextVehiculeId(prev), nom, ...blankResource({ type: "vehicule" }) }]);
  };

  const renameVehicule = (id, nom) => {
    setVehicules((prev) => prev.map((v) => (v.id === id ? { ...v, nom } : v)));
  };

  const editVehicule = (id, patch) => {
    setVehicules((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const addVehiculeMaintenance = (id, entry) => {
    setVehicules((prev) => prev.map((v) => (v.id === id ? { ...v, maintenanceLog: [...(v.maintenanceLog || []), entry] } : v)));
  };

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

  const createProjet = ({ clientId, newClientNom, refFonciere, situation, nature, lat, lng }) => {
    let cid = clientId;
    if (!cid && newClientNom) cid = createClient({ nom: newClientNom });
    const id = `PRJ-2026-0${20 + projetSeqRef.current}`;
    projetSeqRef.current += 1;
    setProjets((prev) => [
      {
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
        prestations: [],
      },
      ...prev,
    ]);
  };

  const editProjet = (projetId, patch) => {
    setProjets((prev) => prev.map((pr) => (pr.id === projetId ? { ...pr, ...patch } : pr)));
  };

  const updateProjetNotes = (projetId, notes) => {
    setProjets((prev) => prev.map((pr) => (pr.id === projetId ? { ...pr, notes } : pr)));
  };

  const addProjetAttachments = (projetId, newAttachments) => {
    if (newAttachments.length === 0) return;
    setProjets((prev) =>
      prev.map((pr) => (pr.id === projetId ? { ...pr, attachments: [...(pr.attachments || []), ...newAttachments] } : pr))
    );
  };

  const removeProjetAttachment = (projetId, index) => {
    setProjets((prev) =>
      prev.map((pr) =>
        pr.id === projetId ? { ...pr, attachments: pr.attachments.filter((_, i) => i !== index) } : pr
      )
    );
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
      if (filterStage !== "all" && !pr.prestations.some((p) => p.stage === filterStage)) return false;
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
    () => buildNotifications(currentUser, { tasks: allPrestationsFlat, employees, materiels, getClient }),
    [currentUser, allPrestationsFlat, employees, materiels, clients]
  );

  const handleOpenNotification = (n) => {
    if (n.prestationId) setOpenPrestationId(n.prestationId);
    else if (n.employeeId) setOpenEmployeeId(n.employeeId);
    else if (n.materielId) setOpenMaterielId(n.materielId);
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
          {view !== "overview" && view !== "cadastre" && (
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

      {(view === "projets" || view === "overview") && enRetardCount > 0 && (
        <div style={{ padding: "16px 24px 0" }}>
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
              codeLabel="Code matériel"
              nameLabel="Désignation"
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
              codeLabel="Code véhicule"
              nameLabel="Véhicule"
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

        {view === "cadastre" && (
          <motion.div key="cadastre" variants={fadeUpVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
            <CadastreTool />
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
