// apiFetch throws "POST /path failed (409): {json}" — pull the server's own message out of it.
export function serverMessage(err, fallback) {
  const raw = String(err?.message || "");
  const json = raw.slice(raw.indexOf("): ") + 3);
  try {
    const parsed = JSON.parse(json);
    return parsed.detail || Object.values(parsed).flat().join(" ") || fallback;
  } catch {
    return fallback;
  }
}
