import { apiBlob, apiDelete, apiGet, apiPost } from "../../lib/api";

// Thin wrappers over /api/consultation/*. Bodies are plain objects (JSON) or FormData (file uploads).
export const consult = (body) => apiPost("/consultation/consult/", body);
export const consultFile = (form) => apiPost("/consultation/consult/file/", form);
export const consultReport = (body) => apiBlob("/consultation/report/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const consultBatch = (form) => apiBlob("/consultation/batch/", { method: "POST", body: form });
export const nearMe = (body) => apiPost("/consultation/near/", body);
export const planRoute = (body) => apiPost("/consultation/route/", body);
export const getNotifications = () => apiGet("/consultation/notifications/");
export const markNotificationsRead = (ids) => apiPost("/consultation/notifications/read/", { ids });
export const scanNotifications = () => apiPost("/consultation/notifications/scan/", {});
export const getLayers = () => apiGet("/consultation/layers/");
export const getLayersGeoJSON = () => apiGet("/consultation/layers/geojson/");
export const createLayer = (form) => apiPost("/consultation/layers/", form);
export const deleteLayer = (id) => apiDelete(`/consultation/layers/${id}/`);
export const getHistory = (q = "") => apiGet(`/consultation/history/${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const historyCsv = () => apiBlob("/consultation/history/csv/");

// The server's French message for a failed call (apiFetch errors carry the JSON body in their text).
export function errorText(err, fallback = "Une erreur est survenue.") {
  const m = String(err?.message || "").match(/\{.*\}/s);
  if (m) {
    try { return JSON.parse(m[0]).detail || fallback; } catch { /* not JSON */ }
  }
  return fallback;
}

export const fmtDistance = (m) => (m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);
