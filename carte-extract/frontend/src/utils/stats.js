import { parseDateFR } from "./dates";

export function projetStatus(projet) {
  if (projet.prestations.length === 0) return "vide";
  if (projet.prestations.some((p) => p.cycles > 0)) return "nonconforme";
  if (projet.prestations.every((p) => p.stage === "livraison" && p.chemin)) return "livre";
  return "encours";
}

export function computeClientStats(client, projects) {
  const clientProjects = projects.filter((p) => p.clientId === client.id);
  let nbPrestations = 0;
  let enCours = 0;
  let nonConf = 0;
  let lastActivity = null;
  clientProjects.forEach((pr) => {
    pr.prestations.forEach((p) => {
      nbPrestations += 1;
      if (p.stage !== "livraison" || !p.chemin) enCours += 1;
      if (p.cycles > 0) nonConf += 1;
      p.history.forEach((h) => {
        const t = parseDateFR(h.date);
        if (t != null && (lastActivity === null || t > lastActivity)) lastActivity = t;
      });
    });
  });
  return { projects: clientProjects, nbProjects: clientProjects.length, nbPrestations, enCours, nonConf, lastActivity };
}

export function computeResourceStats(item, projects, matches) {
  const assignments = [];
  projects.forEach((pr) => {
    pr.prestations.forEach((p) => {
      if (matches(p, item.id)) assignments.push({ prestation: p, projet: pr });
    });
  });
  const enCours = assignments.filter((a) => a.prestation.stage === "affectation" || a.prestation.stage === "execution").length;
  return { assignments, nbUsageTotal: assignments.length, enCours };
}

export const matchesMateriel = (p, id) => (p.materielIds || []).includes(id);
export const matchesVehicule = (p, id) => p.vehiculeId === id;

export function computeEmployeeStats(employee, projects) {
  const assignments = [];
  projects.forEach((pr) => {
    pr.prestations.forEach((p) => {
      const role = (p.agentChantier || []).includes(employee.nom)
        ? "chantier"
        : p.agentBureau === employee.nom || (p.taches || []).some((t) => (t.agents || []).includes(employee.nom))
        ? "bureau"
        : p.agentControle === employee.nom
        ? "controle"
        : null;
      if (role) assignments.push({ prestation: p, projet: pr, role });
    });
  });
  const enCours = assignments.filter((a) => a.prestation.stage !== "livraison").length;
  return { assignments, nbUsageTotal: assignments.length, enCours };
}
