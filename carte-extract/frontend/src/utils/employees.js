// Derives assignment-picker options from live employee records instead of the static
// AGENTS_CHANTIER/AGENTS_BUREAU/AGENTS_CONTROLE constants, so a deactivated employee
// (status !== "actif") can no longer be picked for a new affectation.

export function agentsByRole(employees, role) {
  return (employees || []).filter((e) => e.role === role);
}

export function activeAgentsByRole(employees, role) {
  return agentsByRole(employees, role).filter((e) => (e.status || "actif") === "actif");
}

// Active agents for a role, plus any names already selected even if now inactive — so an
// existing assignment doesn't vanish from its own picker just because the person left.
export function selectableAgentsByRole(employees, role, selectedNames = []) {
  const all = agentsByRole(employees, role);
  const active = all.filter((e) => (e.status || "actif") === "actif");
  const selectedSet = new Set([].concat(selectedNames).filter(Boolean));
  const extraInactive = all.filter((e) => selectedSet.has(e.nom) && (e.status || "actif") !== "actif");
  return [...active, ...extraInactive];
}
