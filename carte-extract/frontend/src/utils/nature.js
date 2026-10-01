// What kind of work a projet is about, read from its prestations' "nature demandée" (and the
// projet's own nature). The Carte draws "Plan côté" projets one way and every other kind of
// survey another, so the two are never mistaken for each other at a glance.
export const NATURES = {
  plan: { label: "Plan côté", short: "Plan côté" },
  bornage: { label: "Bornage terrain", short: "Bornage" },
  lidar: { label: "Relevé LiDAR", short: "LiDAR" },
  autre: { label: "Autres prestations", short: "Autres" },
};

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function natureOf(text) {
  const t = norm(text);
  if (/plan\s*cot/.test(t)) return "plan";
  if (/bornage/.test(t)) return "bornage";
  if (/lidar|drone|scan/.test(t)) return "lidar";
  return null;
}

// A projet with at least one Plan côté counts as Plan côté; otherwise its first recognised nature.
export function natureKind(projet) {
  const kinds = [projet.naturePrestationProjet, ...(projet.prestations || []).map((p) => p.natureDemandee)]
    .map(natureOf)
    .filter(Boolean);
  if (kinds.includes("plan")) return "plan";
  return kinds[0] || "autre";
}
