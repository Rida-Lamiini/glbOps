// What's left of the browser-side PDF kit, for the QR label sheet (utils/labels.js): the brand
// colours, WinAnsi-safe text and the logo. The PV, lot report and monthly report are built on the
// server now (backend/core/pdf_kit.py). jsPDF's built-in fonts only cover WinAnsi, so every string
// goes through `safe()` before it is drawn.

export const COLORS = {
  ink: [29, 27, 24],
  accent: [179, 38, 30],
  muted: [109, 102, 90],
  line: [221, 212, 194],
  paper: [239, 233, 220],
  surface: [255, 253, 248],
  good: [31, 122, 85],
  warn: [183, 121, 31],
  bad: [179, 38, 30],
  info: [47, 102, 144],
};

// WinAnsi-safe text: French accents are fine, arrows / ≤ / narrow spaces are not.
export function safe(value) {
  return String(value ?? "")
    .replace(/[   ]/g, " ")
    .replace(/→/g, "->")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/▲/g, "+")
    .replace(/▼/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\n\x20-\x7E -ÿŒœ–—•…]/g, "");
}

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

let logoPromise = null;
/** The company logo as a data URL with its natural size (cached). Null if it cannot be loaded. */
export function loadLogo(url = "/logo.png") {
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        const data = await blobToDataUrl(blob);
        const img = await loadImageElement(data);
        return { data, w: img.naturalWidth, h: img.naturalHeight, format: "PNG" };
      } catch {
        return null;
      }
    })();
  }
  return logoPromise;
}
