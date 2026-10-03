// What kind of work a prestation (and so a projet) is about, read from its "nature demandée".
// The Carte stamps every prestation with its kind and draws "Plan côté" differently from the rest.
// MEC, COPRO and MT are prestations like any other (a dossier "MEC et COPRO" has one of each).
export const NATURES = {
  plan: { label: "Plan côté", short: "PLAN", color: "#1d1b18" },
  mec: { label: "MEC", short: "MEC", color: "#8a5a2b" },
  copro: { label: "COPRO", short: "COPRO", color: "#2f6f62" },
  mt: { label: "MT", short: "MT", color: "#6d4aa3" },
  bornage: { label: "Bornage terrain", short: "BORN.", color: "#b45f06" },
  lidar: { label: "Relevé LiDAR", short: "LIDAR", color: "#1f6f8b" },
  autre: { label: "Autres prestations", short: "AUTRE", color: "#6d665a" },
};

// Also the order of priority when a projet carries several kinds (its pin shows the first one).
export const NATURE_ORDER = Object.keys(NATURES);

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function natureOf(text) {
  const t = norm(text);
  if (/plan\s*cot/.test(t)) return "plan";
  if (/\bmec\b/.test(t)) return "mec";
  if (/copro/.test(t)) return "copro";
  if (/\bmt\b|mutation/.test(t)) return "mt";
  if (/bornage/.test(t)) return "bornage";
  if (/lidar|drone|scan/.test(t)) return "lidar";
  return null;
}

export const prestationKind = (prestation) => natureOf(prestation?.natureDemandee) || "autre";

// Every kind a projet's prestations cover, most important first ("autre" when it has none).
export function projetNatures(projet) {
  let kinds = (projet.prestations || []).map((p) => natureOf(p.natureDemandee)).filter(Boolean);
  if (kinds.length === 0) kinds = [natureOf(projet.naturePrestationProjet)].filter(Boolean);
  const set = new Set(kinds);
  const ordered = NATURE_ORDER.filter((k) => set.has(k));
  return ordered.length ? ordered : ["autre"];
}

// The kind a projet is drawn with (pin glyph, outline).
export const natureKind = (projet) => projetNatures(projet)[0];
