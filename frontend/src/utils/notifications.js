import { isPastDue } from "./dates";
import { vehiculeAlerts } from "./vehicule";

const REJECT_PREFIXES = ["Non conforme", "Données insuffisantes"];

// A rejection (contrôle non-conforme, or bureau's own "données insuffisantes") sends the
// prestation back a stage — but `cycles` stays > 0 forever even once redone, so we only flag
// it as a *live* rejection when the last history entry is actually the rejection itself.
export function rejectionReason(prestation) {
  const last = prestation.history[prestation.history.length - 1];
  if (prestation.cycles > 0 && REJECT_PREFIXES.some((p) => last?.label?.startsWith(p))) {
    return last.label.replace(/^(Non conforme|Données insuffisantes) — /, "");
  }
  return null;
}

const clientLabel = (p, getClient) => getClient(p.projet.clientId)?.nom || p.projet.id;

// Notifications are always derived from current state — no separate log to keep in sync, no
// read/unread bookkeeping. Each item carries whichever *Id lets the header wire an onOpen
// callback back to the right drawer.
export function buildNotifications(currentUser, { tasks = [], employees = [], materiels = [], vehicules = [], getClient }) {
  const office = currentUser.role === "Dispatcher" || currentUser.role === "Directrice";
  const notes = [];

  if (office) {
    tasks.forEach((p) => {
      const reason = rejectionReason(p);
      if (reason) {
        notes.push({ id: `nc-${p.id}`, kind: "bad", label: `Non-conformité — ${clientLabel(p, getClient)}`, detail: reason, prestationId: p.id });
      }
    });
    employees.forEach((e) => {
      (e.conges || []).filter((c) => c.statut === "en_attente").forEach((c) => {
        notes.push({ id: `conge-${c.id}`, kind: "warn", label: `Congé en attente — ${e.nom}`, detail: `${c.dateDebut} → ${c.dateFin}`, employeeId: e.id });
      });
    });
    materiels.forEach((m) => {
      if (isPastDue(m.prochaineCalibration)) {
        notes.push({ id: `cal-${m.id}`, kind: "warn", label: `Étalonnage en retard — ${m.nom}`, detail: m.prochaineCalibration, materielId: m.id });
      }
    });
    vehicules.forEach((v) => {
      vehiculeAlerts(v).forEach((a) => {
        notes.push({
          id: `veh-${v.id}-${a.key}`,
          kind: a.level === "late" ? "bad" : "warn",
          label: `${a.label} ${a.level === "late" ? "expirée" : "à renouveler"} — ${v.nom}`,
          detail: a.due ? `${a.text} (${a.due})` : a.text,
          vehiculeId: v.id,
        });
      });
    });
    return notes;
  }

  if (currentUser.role === "Agent Chantier") {
    tasks.forEach((p) => {
      if (p.reprogramme) {
        notes.push({ id: `reprog-${p.id}`, kind: "warn", label: `Reprise programmée — ${clientLabel(p, getClient)}`, detail: `Prévue le ${p.dateDebutExec}`, prestationId: p.id });
      }
      const reason = rejectionReason(p);
      if (reason && p.stage === "execution") {
        notes.push({ id: `redo-${p.id}`, kind: "bad", label: `Renvoyé en exécution — ${clientLabel(p, getClient)}`, detail: reason, prestationId: p.id });
      }
    });
    return notes;
  }

  if (currentUser.role === "Agent Bureau") {
    tasks.forEach((p) => {
      if (p.stage !== "bureau") return;
      const reason = rejectionReason(p);
      notes.push({
        id: `bureau-${p.id}`,
        kind: reason ? "bad" : "info",
        label: reason ? `Renvoyé par le contrôle — ${clientLabel(p, getClient)}` : `À traiter — ${clientLabel(p, getClient)}`,
        detail: reason || p.natureExecutee,
        prestationId: p.id,
      });
    });
    return notes;
  }

  if (currentUser.role === "Agent Contrôle") {
    tasks.forEach((p) => {
      if (p.stage !== "controle") return;
      notes.push({ id: `controle-${p.id}`, kind: "info", label: `À contrôler — ${clientLabel(p, getClient)}`, detail: p.natureExecutee, prestationId: p.id });
    });
    return notes;
  }

  return notes;
}
