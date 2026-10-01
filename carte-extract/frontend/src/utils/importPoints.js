export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Fichier GPX invalide");
  return [...doc.querySelectorAll("wpt")].map((wpt, i) => {
    const lat = parseFloat(wpt.getAttribute("lat"));
    const lng = parseFloat(wpt.getAttribute("lon"));
    const name = wpt.querySelector("name")?.textContent?.trim() || `Point ${i + 1}`;
    return { name, lat, lng };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const splitLine = (line) => line.split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const latIdx = header.findIndex((h) => /^lat/.test(h));
  const lngIdx = header.findIndex((h) => /^(lng|lon|long)/.test(h));
  const nameIdx = header.findIndex((h) => /^(nom|name|label|situation)/.test(h));
  const hasHeader = latIdx !== -1 && lngIdx !== -1;

  const rows = hasHeader ? lines.slice(1) : lines;
  const li = hasHeader ? latIdx : 0;
  const lo = hasHeader ? lngIdx : 1;
  const ni = hasHeader ? nameIdx : 2;

  return rows.map((line, i) => {
    const cols = splitLine(line);
    const lat = parseFloat(cols[li]?.replace(",", "."));
    const lng = parseFloat(cols[lo]?.replace(",", "."));
    const name = (ni !== -1 && cols[ni]) || `Point ${i + 1}`;
    return { name, lat, lng };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export function parseImportFile(filename, text) {
  return /\.gpx$/i.test(filename) ? parseGPX(text) : parseCSV(text);
}

// KML: Placemarks with a Point become pins (like GPX waypoints); LineStrings and Polygons come
// back as GeoJSON features so the map can draw the traces and parcels too.
const kmlCoords = (node) =>
  (node?.textContent || "")
    .trim()
    .split(/\s+/)
    .map((c) => c.split(",").map(Number))
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0], c[1]]);

export function parseKML(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Fichier KML invalide");
  const points = [];
  const features = [];
  [...doc.querySelectorAll("Placemark")].forEach((pm, i) => {
    const name = pm.querySelector(":scope > name")?.textContent?.trim() || `Élément ${i + 1}`;
    const description = pm.querySelector(":scope > description")?.textContent?.trim() || "";
    pm.querySelectorAll("Point").forEach((pt) => {
      const [c] = kmlCoords(pt.querySelector("coordinates"));
      if (c) points.push({ name, lat: c[1], lng: c[0] });
    });
    pm.querySelectorAll("LineString").forEach((ls) => {
      const coords = kmlCoords(ls.querySelector("coordinates"));
      if (coords.length > 1) features.push({ type: "Feature", properties: { name, description }, geometry: { type: "LineString", coordinates: coords } });
    });
    pm.querySelectorAll("Polygon").forEach((pg) => {
      const rings = [pg.querySelector("outerBoundaryIs coordinates"), ...pg.querySelectorAll("innerBoundaryIs coordinates")]
        .map(kmlCoords)
        .filter((r) => r.length > 2);
      if (rings.length) features.push({ type: "Feature", properties: { name, description }, geometry: { type: "Polygon", coordinates: rings } });
    });
  });
  return { points, shapes: { type: "FeatureCollection", features } };
}
