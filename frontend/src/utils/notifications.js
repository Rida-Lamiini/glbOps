import { isPastDue, isTomorrow } from "./dates";
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

// A saved comment carries the mentions the server resolved (current employee names, so they
// survive a rename). A comment still on its way to the server falls back to "@Full Name" in
// its text.
export const isMentioned = (comment, name) =>
  !!name && (Array.isArray(comment.mentions) ? comment.mentions.includes(name) : (comment.text || "").includes(`@${name}`));

// Notifications are always derived from current state — no separate log to keep in sync, no
// read/unread bookkeeping. Each item carries whichever *Id lets the header wire an onOpen
// callback back to the right drawer.
export function buildNotifications(currentUser, { tasks = [], employees = [], materiels = [], vehicules = [], getClient }) {
  const office = currentUser.role === "Dispatcher" || currentUser.role === "Directrice";
  const notes = [];
  const me = currentUser.name || currentUser.role;

  // Same rule for every role: a comment that names you, that you didn't write yourself, and
  // that you haven't already read (server-computed per-viewer via c.isRead) surfaces here.
  tasks.forEach((p) => {
    (p.comments || []).forEach((c) => {
      if (c.author !== me && !c.isRead && isMentioned(c, me)) {
        notes.push({
          id: `mention-${c.id ?? `${p.id}-${c.date}`}`,
          kind: "info",
          label: `Mentionné par ${c.author} — ${clientLabel(p, getClient)}`,
          detail: c.text,
          prestationId: p.id,
        });
      }
    });
  });

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
      // A visite planned for tomorrow (stage still "affectation" — not yet started) is worth a
      // proactive nudge, not just something the agent has to notice by scrolling their list.
      if (p.stage === "affectation" && isTomorrow(p.dateDebutExec)) {
        notes.push({ id: `demain-${p.id}`, kind: "warn", label: `Visite demain — ${clientLabel(p, getClient)}`, detail: p.dateDebutExec, prestationId: p.id });
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
