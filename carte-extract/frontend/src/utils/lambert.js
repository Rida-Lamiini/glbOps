import proj4 from "proj4";

// EPSG:26191 — Merchich / Nord Maroc, the Lambert conformal conic projection used on Moroccan
// cadastral records and survey deliverables. Covers northern and central Morocco (Rabat,
// Casablanca, Kénitra...), which is where this app's seed data — and most of a Rabat/Casablanca
// surveying company's actual work — sits.
const LAMBERT_NORD_MAROC =
  "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +ellps=clrk80ign +towgs84=31,146,47,0,0,0,0 +units=m +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

export function toLambertNordMaroc(lat, lng) {
  const [x, y] = proj4(WGS84, LAMBERT_NORD_MAROC, [lng, lat]);
  return { x, y };
}

export function formatLambert(lat, lng) {
  if (lat == null || lng == null) return null;
  const { x, y } = toLambertNordMaroc(lat, lng);
  return `X ${x.toFixed(1)}  Y ${y.toFixed(1)}`;
}
