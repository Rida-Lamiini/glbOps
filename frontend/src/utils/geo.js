export const downloadFile = (filename, content, mime) => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const projectProps = (pr, getClient) => {
  const client = getClient(pr.clientId);
  return {
    id: pr.id,
    client: client?.nom || "",
    code_client: client?.code || "",
    reference_fonciere: pr.referenceFonciere,
    situation: pr.situation,
    nature: pr.naturePrestationProjet,
    date_debut: pr.dateDebut,
    nb_prestations: pr.prestations.length,
  };
};

export const buildGeoJSON = (projects, getClient) => {
  const features = projects
    .filter((pr) => pr.lat != null && pr.lng != null)
    .map((pr) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [pr.lng, pr.lat] },
      properties: projectProps(pr, getClient),
    }));
  return JSON.stringify({ type: "FeatureCollection", features }, null, 2);
};

const escapeXML = (s) =>
  String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

export const buildKML = (projects, getClient) => {
  const placemarks = projects
    .filter((pr) => pr.lat != null && pr.lng != null)
    .map((pr) => {
      const props = projectProps(pr, getClient);
      const extendedData = Object.entries(props)
        .map(([k, v]) => `<Data name="${escapeXML(k)}"><value>${escapeXML(v)}</value></Data>`)
        .join("");
      return `
    <Placemark>
      <name>${escapeXML(pr.id)} — ${escapeXML(props.client)}</name>
      <description>${escapeXML(props.reference_fonciere)} · ${escapeXML(props.situation)}</description>
      <ExtendedData>${extendedData}</ExtendedData>
      <Point><coordinates>${pr.lng},${pr.lat},0</coordinates></Point>
    </Placemark>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Globetudes — Projets</name>${placemarks}
  </Document>
</kml>`;
};
