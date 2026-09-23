const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

// Access token lives in memory only; the refresh token is kept in localStorage (survives a
// closed browser — "stay logged in") or sessionStorage ("poste partagé" — gone once the tab
// closes) depending on what was chosen at login. Read from both so a stale copy in the other
// store from a previous choice can't shadow the current one.
let accessToken = null;

const REFRESH_KEY = "glbops.refreshToken";

export const getRefreshToken = () => sessionStorage.getItem(REFRESH_KEY) || localStorage.getItem(REFRESH_KEY);

const setTokens = ({ access, refresh }, persistent = true) => {
  accessToken = access;
  if (!refresh) return;
  if (persistent) {
    localStorage.setItem(REFRESH_KEY, refresh);
    sessionStorage.removeItem(REFRESH_KEY);
  } else {
    sessionStorage.setItem(REFRESH_KEY, refresh);
    localStorage.removeItem(REFRESH_KEY);
  }
};

export const clearTokens = () => {
  accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
};

export const isAuthenticated = () => Boolean(accessToken || getRefreshToken());

async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const data = await res.json();
  accessToken = data.access;
  return true;
}

export async function login(username, password, { sharedDevice = false } = {}) {
  const res = await fetch(`${API_BASE_URL}/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Identifiants invalides");
  }
  setTokens(await res.json(), !sharedDevice);
}

export async function restoreSession() {
  if (accessToken) return true;
  return refreshAccessToken();
}

// Generic fetch wrapper: attaches the bearer token, retries once after a silent token
// refresh on 401, and throws on any other non-2xx response.
export async function apiFetch(path, options = {}, { retry = true } = {}) {
  const headers = { ...(options.headers || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const isFormData = options.body instanceof FormData;
  if (options.body && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetch(path, options, { retry: false });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${options.method || "GET"} ${path} failed (${res.status}): ${body}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// Same as apiFetch (bearer token, one silent refresh on 401) but returns the raw response body: for file downloads.
export async function apiBlob(path, options = {}, { retry = true } = {}) {
  const headers = { ...(options.headers || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiBlob(path, options, { retry: false });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${options.method || "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return res.blob();
}

export const apiGet = (path) => apiFetch(path);

export const apiPost = (path, data) =>
  apiFetch(path, { method: "POST", body: data instanceof FormData ? data : JSON.stringify(data) });

export const apiPatch = (path, data) =>
  apiFetch(path, { method: "PATCH", body: data instanceof FormData ? data : JSON.stringify(data) });

export const apiDelete = (path) => apiFetch(path, { method: "DELETE" });
