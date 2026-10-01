import { setWorkerUrl } from "maplibre-gl";

// maplibre-gl locates its tile-parsing worker via a runtime `import.meta.url`-relative path
// to a sibling file (maplibre-gl-worker.mjs, which itself imports maplibre-gl-shared.mjs).
// That only survives when the library is served unbundled — a production Rollup build inlines
// it into the app chunk and drops the reference, so the worker silently 404s (the SPA falls
// back to index.html) and every tile request after the style/sprite load just hangs forever.
// Self-hosting both files as static, unhashed public/ assets (kept in sync with the installed
// maplibre-gl version — see package.json's postinstall) sidesteps bundling entirely: they're
// served as-is, so the worker's own relative import of the shared chunk still resolves.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const RASTER_FALLBACK_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export const TOPO_STYLE = {
  version: 8,
  sources: {
    topo: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)",
    },
  },
  layers: [{ id: "topo", type: "raster", source: "topo" }],
};

export const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};
