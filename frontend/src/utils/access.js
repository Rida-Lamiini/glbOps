export const ALL_TABS = ["overview", "projets", "clients", "materiels", "vehicules", "employes", "carte", "calendrier", "analytics", "cadastre"];

// Dispatcher/Directrice run the business and see every tab. Field and support roles (Agent
// Chantier/Bureau/Contrôle) only need their own work (Projets, already scoped by
// visibleToUser), where those jobs are (Carte), and their schedule (Calendrier) — not the
// client roster, resource/asset management, or colleagues' HR & congé records.
// Agent Bureau and Agent Contrôle also need Cadastre — the backend already lets them review
// and validate lots (see cadastre/views.py's STATUT_ROLES), so hiding the tab from them left
// that permission unreachable. Agent Chantier has no role in that review, so it stays out.
export function visibleTabsForRole(role) {
  const office = role === "Dispatcher" || role === "Directrice";
  if (office) return ALL_TABS;
  const base = ["projets", "carte", "calendrier"];
  if (role === "Agent Bureau" || role === "Agent Contrôle") return [...base, "cadastre"];
  return base;
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
  if (currentUser.role === "Agent Bureau") {
    if (prestation.agentBureau === currentUser.name) return true;
    if ((prestation.taches || []).some((t) => (t.agents || []).includes(currentUser.name))) return true;
    // A prestation lands on "bureau" with nobody assigned yet — it has to be visible to every
    // bureau agent, or nobody can see the incoming work (terrain photos included) to claim it.
    if (!prestation.agentBureau && ["bureau", "controle", "livraison"].includes(prestation.stage)) return true;
    return false;
  }
  if (currentUser.role === "Agent Contrôle") {
    if (prestation.agentControle === currentUser.name) return true;
    // Same gap as above, one stage further down the pipeline.
    if (!prestation.agentControle && ["controle", "livraison"].includes(prestation.stage)) return true;
    return false;
  }
  return true;
}
