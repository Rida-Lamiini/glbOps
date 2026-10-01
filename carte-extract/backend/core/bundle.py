"""Update bundles: a zip with a snapshot of the data, the lot geometries and the uploaded files.

Exported from the main glbOps database (``manage.py export_bundle``) and imported into the
standalone Carte app (button "Importer une mise à jour", or ``manage.py import_bundle``).
Rows are matched by primary key, so importing the same bundle twice changes nothing and a lot
edited in glbOps is updated rather than duplicated. Nothing is ever deleted by an import.
"""

import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management import call_command

from .storage import list_files, read_file, write_file

BUNDLE_VERSION = 1
DUMP_LABELS = ["auth.User", "core", "employees", "clients", "resources", "projets", "cadastre"]
SKIP_MODELS = {"contenttypes", "sessions", "admin", "auth.permission"}


class BundleError(Exception):
    pass


def export_bundle(path) -> dict:
    from cadastre.db.geometry import get_lot_geometry_geojson
    from cadastre.models import Lot

    counts = {}
    with tempfile.TemporaryDirectory() as tmp:
        data_path = Path(tmp) / "data.json"
        with open(data_path, "w", encoding="utf-8") as fh:
            call_command("dumpdata", *DUMP_LABELS, natural_foreign=True, stdout=fh)
        rows = json.loads(data_path.read_text(encoding="utf-8"))
        for row in rows:
            counts[row["model"]] = counts.get(row["model"], 0) + 1

        geometries = {}
        for lot_id in Lot.objects.values_list("id", flat=True):
            geometry = get_lot_geometry_geojson(lot_id)
            if geometry:
                geometries[str(lot_id)] = geometry

        manifest = {
            "version": BUNDLE_VERSION,
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "counts": counts,
            "lots_with_geometry": len(geometries),
        }
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            zf.write(data_path, "data.json")
            zf.writestr("geometry.json", json.dumps(geometries))
            for name in list_files():
                try:
                    zf.writestr("media/" + name, read_file(name))
                    manifest["files"] = manifest.get("files", 0) + 1
                except FileNotFoundError:
                    continue
    return manifest


def import_bundle(path) -> dict:
    from cadastre.db.geometry import set_lot_geometry_geojson
    from cadastre.models import Lot

    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile as exc:
        raise BundleError("Ce fichier n'est pas une mise à jour valide (zip attendu).") from exc
    with zf:
        names = set(zf.namelist())
        if not {"manifest.json", "data.json", "geometry.json"} <= names:
            raise BundleError("Ce fichier n'est pas une mise à jour Carte (manifest manquant).")
        manifest = json.loads(zf.read("manifest.json"))
        if manifest.get("version") != BUNDLE_VERSION:
            raise BundleError("Version de mise à jour non prise en charge.")

        with tempfile.TemporaryDirectory() as tmp:
            data_path = Path(tmp) / "bundle.json"
            data_path.write_bytes(zf.read("data.json"))
            call_command("loaddata", str(data_path), verbosity=0)

        geometries = json.loads(zf.read("geometry.json"))
        known = {str(i) for i in Lot.objects.values_list("id", flat=True)}
        applied = 0
        for lot_id, geometry in geometries.items():
            if lot_id in known:
                set_lot_geometry_geojson(lot_id, geometry["polygon"], geometry["centroid"])
                applied += 1

        files = 0
        for name in names:
            if not name.startswith("media/") or name.endswith("/"):
                continue
            rel = name[len("media/"):]
            if ".." in rel.split("/"):
                continue  # never write outside the media storage
            info = zf.getinfo(name)
            try:
                if default_storage.exists(rel) and default_storage.size(rel) == info.file_size:
                    continue
            except OSError:
                pass
            write_file(rel, zf.read(name))
            files += 1

    return {"manifest": manifest, "geometries": applied, "files": files}
