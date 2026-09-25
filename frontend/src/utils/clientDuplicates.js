// Spots clients that are probably the same company entered twice ("FM6" vs the full foundation
// name, "Engie Conseil" vs "ENGIE CONSEIL SA", a typo...). Purely a hint: nothing is merged.

const STOPWORDS = new Set([
  "ste", "societe", "sarl", "sarlau", "sa", "sas", "au", "mr", "mme", "m", "groupe", "cabinet",
  "de", "des", "du", "d", "la", "le", "les", "l", "et", "and", "the",
]);
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

const words = (nom) =>
  (nom || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const tokensOf = (nom) => words(nom).filter((w) => !STOPWORDS.has(w));

const levenshtein = (a, b) => {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
};

// "Fondation Mohammed VI des Sciences et de la Santé" -> "fm6ss"
const initialsOf = (tokens) => tokens.map((t) => (ROMAN[t] ? String(ROMAN[t]) : t[0])).join("");

/** Why two names look alike, or null when they don't. */
export function similarity(a, b) {
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (!ta.length || !tb.length) return null;
  const ja = ta.join(" ");
  const jb = tb.join(" ");
  if (ja === jb) return "Même nom";

  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (small.length >= 2 && small.every((t) => large.includes(t))) return "Nom contenu dans l'autre";
  if (small.length === 1 && small[0].length >= 5 && large.includes(small[0])) return "Nom contenu dans l'autre";

  // A one-word acronym against a longer name ("FM6" / "Fondation Mohammed VI ...").
  if (small.length === 1 && large.length >= 2 && small[0].length >= 3 && initialsOf(large).startsWith(small[0])) return "Sigle possible";

  const len = Math.min(ja.length, jb.length);
  if (len >= 4) {
    const d = levenshtein(ja, jb);
    if (d <= (len >= 9 ? 2 : 1)) return "Orthographe proche";
  }
  return null;
}

/** Existing clients that resemble `nom` (used while typing a new client). */
export function findSimilarClients(nom, clients) {
  return clients
    .map((client) => ({ client, reason: similarity(nom, client.nom) }))
    .filter((m) => m.reason);
}

/** Groups of clients that probably are one company: [{ clients: [...], reasons: [...] }]. */
export function duplicateGroups(clients) {
  const parent = clients.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const reasons = new Map();
  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      const reason = similarity(clients[i].nom, clients[j].nom);
      if (!reason) continue;
      parent[find(i)] = find(j);
      reasons.set(i, reason);
      reasons.set(j, reason);
    }
  }
  const byRoot = new Map();
  clients.forEach((c, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, { clients: [], reasons: new Set() });
    byRoot.get(r).clients.push(c);
    if (reasons.has(i)) byRoot.get(r).reasons.add(reasons.get(i));
  });
  return [...byRoot.values()]
    .filter((g) => g.clients.length > 1)
    .map((g) => ({ clients: g.clients, reasons: [...g.reasons] }));
}
