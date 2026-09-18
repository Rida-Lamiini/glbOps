export const ALL_TABS = ["overview", "projets", "clients", "materiels", "vehicules", "employes", "carte", "calendrier", "cadastre"];

// Dispatcher/Directrice run the business and see every tab. Field and support roles (Agent
// Chantier/Bureau/Contrôle) only need their own work (Projets, already scoped by
// visibleToUser), where those jobs are (Carte), and their schedule (Calendrier) — not the
// client roster, resource/asset management, or colleagues' HR & congé records.
export function visibleTabsForRole(role) {
  const office = role === "Dispatcher" || role === "Directrice";
  if (office) return ALL_TABS;
  return ["projets", "carte", "calendrier"];
}

// Each stage has exactly one owning role who can actually operate it — Dispatcher/Directrice
// included: their own job is intake (demande/prestation) and archiving (livraison), not doing
// the field visit, the bureau processing, or the QC call for someone else. Office still sees
// every stage in full (visibleToUser never restricts them) — canAct only gates the buttons.
export function canAct(stageKey, currentUser) {
  const office = currentUser.role === "Dispatcher" || currentUser.role === "Directrice";
  if (stageKey === "demande" || stageKey === "prestation" || stageKey === "livraison") return office;
  if (stageKey === "affectation" || stageKey === "execution") return currentUser.role === "Agent Chantier";
  if (stageKey === "bureau") return currentUser.role === "Agent Bureau";
  if (stageKey === "controle") return currentUser.role === "Agent Contrôle";
  return false;
}

export function visibleToUser(prestation, currentUser) {
  const office = currentUser.role === "Dispatcher" || currentUser.role === "Directrice";
  if (office) return true;
  if (currentUser.role === "Agent Chantier") return (prestation.agentChantier || []).includes(currentUser.name);
  if (currentUser.role === "Agent Bureau")
    return prestation.agentBureau === currentUser.name || (prestation.taches || []).some((t) => (t.agents || []).includes(currentUser.name));
  if (currentUser.role === "Agent Contrôle") return prestation.agentControle === currentUser.name;
  return true;
}
