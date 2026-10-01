// Copies maplibre-gl's worker + its shared chunk into public/maplibre/ as static,
// unhashed assets. See the comment above setWorkerUrl() in src/utils/mapStyle.js for why.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "node_modules", "maplibre-gl", "dist");
const destDir = join(root, "public", "maplibre");

mkdirSync(destDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
console.log("Synced maplibre-gl worker files into public/maplibre/");
