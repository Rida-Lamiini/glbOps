import { apiBlob, apiDelete, apiFetch, apiGet, apiPost } from "../../lib/api";
import { saveBlob } from "../../utils/saveBlob";

// The cadastre endpoints speak snake_case like the rest of the Django API; the
// components below are written in the app's camelCase house style, so the
// mapping happens here once rather than at every call site (same split as
// lib/apiAdapters.js does for projets).

export const parseCadastrePdf = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const data = await apiPost("/cadastre/lots/parse-pdf/", formData);
  return {
    extractionMethod: data.extraction_method,
    rawOcrText: data.raw_ocr_text || "",
    header: {
      proprieteDite: data.header.propriete_dite,
      natureAffaire: data.header.nature_affaire,
      titreFoncier: data.header.titre_foncier,
      lot: data.header.lot,
      systeme: data.header.systeme,
      surfaceCalculeeM2: data.header.surface_calculee_m2,
      correctionLambertM2: data.header.correction_lambert_m2,
      surfaceCorrigeeM2: data.header.surface_corrigee_m2,
      contenanceAdopteeM2: data.header.contenance_adoptee_m2,
      date: data.header.date,
      geometre: data.header.geometre,
    },
    bornes: (data.bornes || []).map((b) => ({
      name: b.name,
      sequence: b.sequence,
      x: b.x,
      y: b.y,
      flagged: b.flagged,
      flagReason: b.flag_reason,
    })),
  };
};

// Excel import: the workbook is only read here; the reviewed lots are saved one by one with createCadastreLot.
export const parseExcelLots = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const data = await apiPost("/cadastre/lots/parse-excel/", formData);
  return {
    warnings: data.warnings || [],
    lots: data.lots.map((l) => ({
      row: l.row,
      titre: l.titre_foncier,
      propriete: l.propriete_dite,
      lotNumber: l.lot_number,
      affaireRef: l.affaire_ref,
      geometre: l.geometre,
      dateLeve: l.date_leve,
      serviceCadastre: l.service_cadastre,
      projet: l.projet,
      prestation: l.prestation,
      surfaceDocumentM2: l.surface_document_m2,
      correctionLambertM2: l.correction_lambert_m2,
      surfaceCalculeeM2: l.surface_calculee_m2,
      ecartM2: l.ecart_m2,
      conforme: l.conforme,
      bornes: l.bornes,
      errors: l.errors,
      warnings: l.warnings,
    })),
  };
};

export const downloadExcelTemplate = async () => saveBlob(await apiBlob("/cadastre/lots/excel-template/"), "modele-import-lots.xlsx");

// The reverse of the import: every current lot (with its bornes), same "Lots"/"Bornes" shape.
export const downloadLotsExcel = async () => saveBlob(await apiBlob("/cadastre/lots/export-excel/"), "lots-cadastraux.xlsx");

const toLotSummary = (lot) => ({
  id: lot.id,
  projet: lot.projet,
  prestation: lot.prestation || "",
  statut: lot.statut || "brouillon",
  statutAt: lot.statut_at,
  createdByName: lot.created_by_name || "",
  statutParName: lot.statut_par_name || "",
  titreFoncier: lot.titre_foncier,
  proprieteDite: lot.propriete_dite,
  surfaceDocumentM2: Number(lot.surface_document_m2),
  surfaceCalculeeM2: Number(lot.surface_calculee_m2),
  correctionLambertM2: Number(lot.correction_lambert_m2),
  updatedAt: lot.updated_at,
  conforme: lot.conforme,
});

export const listCadastreLots = async (query) => {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  const data = await apiGet(`/cadastre/lots/${suffix}`);
  return (data.lots || []).map(toLotSummary);
};

export const getCadastreLot = async (id) => {
  const lot = await apiGet(`/cadastre/lots/${id}/`);
  return {
    ...toLotSummary(lot),
    lotNumber: lot.lot_number || "",
    affaireRef: lot.affaire_ref || "",
    geometre: lot.geometre || "",
    dateLeve: lot.date_leve,
    serviceCadastre: lot.service_cadastre || "",
    bornes: (lot.bornes || []).map((b) => ({
      id: b.id,
      name: b.name,
      sequence: b.sequence,
      xLambert: Number(b.x_lambert),
      yLambert: Number(b.y_lambert),
      lat: Number(b.lat),
      lng: Number(b.lng),
    })),
    distanceChecks: (lot.distance_checks || []).map((dc) => ({
      id: dc.id,
      segmentLabel: dc.segment_label,
      croquisM: Number(dc.croquis_m),
      calculeM: Number(dc.calcule_m),
      ecartM: Number(dc.ecart_m),
    })),
    referencePoints: (lot.reference_points || []).map((rp) => ({
      id: rp.id,
      label: rp.label,
      lat: Number(rp.lat),
      lng: Number(rp.lng),
      distanceM: Number(rp.distance_m),
      bearingDeg: Number(rp.bearing_deg),
    })),
  };
};

export const getCadastreLotGeoJSON = (id) => apiGet(`/cadastre/lots/${id}/geojson/`);

// Every saved lot's polygon, for the main "Carte" overview — past surveys are
// useful context when siting a new project nearby.
export const getAllCadastreLotsGeoJSON = () => apiGet("/cadastre/lots/geojson/");

// Shared by create and update: distance_checks / reference_points are passed
// through unchanged (this UI doesn't edit them yet, see ReviewScreen) so an
// edit never silently drops a lot's existing ones.
const buildLotBody = (payload) => ({
  projet: payload.projet || null,
  prestation: payload.prestation || null,
  titre_foncier: payload.titreFoncier,
  propriete_dite: payload.proprieteDite,
  lot_number: payload.lotNumber || "",
  affaire_ref: payload.affaireRef || "",
  geometre: payload.geometre || "",
  date_leve: payload.dateLeve || null,
  service_cadastre: payload.serviceCadastre || "",
  surface_document_m2: payload.surfaceDocumentM2,
  correction_lambert_m2: payload.correctionLambertM2,
  bornes: payload.bornes.map((b) => ({
    name: b.name,
    sequence: b.sequence,
    x_lambert: b.x,
    y_lambert: b.y,
  })),
  distance_checks: (payload.distanceChecks || []).map((dc) => ({
    segment_label: dc.segmentLabel,
    croquis_m: dc.croquisM,
  })),
  reference_points: (payload.referencePoints || []).map((rp) => ({
    label: rp.label,
    lat: rp.lat,
    lng: rp.lng,
  })),
});

export const createCadastreLot = (payload) => apiPost("/cadastre/lots/", buildLotBody(payload));

export const updateCadastreLot = (id, payload) =>
  apiFetch(`/cadastre/lots/${id}/`, { method: "PUT", body: JSON.stringify(buildLotBody(payload)) });

export const deleteCadastreLot = (id) => apiDelete(`/cadastre/lots/${id}/`);

/**
 * apiFetch throws a single Error string on any non-2xx, which buries DRF's
 * per-field messages inside the thrown text. Pull them back out so the form can
 * show the actual reason ("Un lot avec ce titre foncier existe déjà.") rather
 * than a raw status line.
 */
export function readApiError(error, fallback) {
  const match = /\((\d{3})\): (.*)$/s.exec(error?.message || "");
  if (!match) return fallback;
  try {
    const body = JSON.parse(match[2]);
    if (typeof body.error === "string") return body.error;
    if (typeof body.detail === "string") return body.detail;
    const messages = Object.entries(body).flatMap(([field, value]) => {
      const list = Array.isArray(value) ? value : [value];
      return list.map((v) => (field === "non_field_errors" ? String(v) : `${field} : ${v}`));
    });
    if (messages.length > 0) return messages.join(" ");
  } catch {
    // Not JSON — fall through to the caller's generic message.
  }
  return fallback;
}

// Earlier lots worth reusing on a projet: same titre foncier, or within `radius` metres.
export const findLotMatches = async ({ titre, lat, lng, radius = 200, projet } = {}) => {
  const params = new URLSearchParams();
  if (titre) params.set("titre", titre);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set("lat", lat);
    params.set("lng", lng);
    params.set("radius", radius);
  }
  if (projet) params.set("projet", projet);
  const data = await apiGet(`/cadastre/lots/matches/?${params}`);
  const toMatch = (m) => ({
    id: m.id,
    titreFoncier: m.titre_foncier,
    proprieteDite: m.propriete_dite,
    projet: m.projet,
    surfaceM2: Number(m.surface_document_m2),
    nbBornes: m.nb_bornes,
    createdAt: m.created_at,
    distanceM: m.distance_m,
  });
  return { sameTitre: data.same_titre.map(toMatch), nearby: data.nearby.map(toMatch) };
};

// Attaches an unowned lot to the projet, or copies one that belongs elsewhere
// (the copy remembers its origin; the original survey is never modified).
export const reuseLot = (lotId, projetId) => apiPost(`/cadastre/lots/${lotId}/reuse/`, { projet: projetId });

// Review status: brouillon -> verifie (bureau) -> valide (contrôle). The server checks the role.
export const setLotStatut = (id, statut) => apiPost(`/cadastre/lots/${id}/statut/`, { statut });
