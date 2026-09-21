// What a QR label encodes and how the app reads it back. The label carries a plain web link, so
// any phone camera can open it; the app then lands on the scan page for that resource.

const PARAM = "ressource";

// A phone cannot open "localhost": set VITE_PUBLIC_URL to the address the team really uses
// (a deployed URL, or the office PC's address on the local network).
export const publicBaseUrl = () => (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/+$/, "");

export const resourceUrl = (id) => `${publicBaseUrl()}/?${PARAM}=${encodeURIComponent(id)}`;

/** The resource id in the current address, or null. */
export const scannedResourceId = () => {
  const id = new URLSearchParams(window.location.search).get(PARAM);
  return id && /^[A-Za-z0-9_-]{1,20}$/.test(id) ? id : null;
};

/** Drops the ?ressource= part so a refresh does not reopen the scan page. */
export const clearScannedResource = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
};

export const isVehicleId = (id) => /^VEH-/i.test(id);
