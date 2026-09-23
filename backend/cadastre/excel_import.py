"""Import of cadastral lots from an Excel workbook, plus the downloadable template.

Layout (two sheets): "Lots" has one row per lot, "Bornes" has one row per borne and points at its lot by
the titre foncier. Nothing is written here: `parse_lots_workbook` returns each lot with the problems found
(`errors` block the import, `warnings` do not) and the surface recomputed from the bornes, so the user
reviews before anything is saved. Saving goes through the normal lot creation endpoint.
"""

import re
import unicodedata
from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from projets.models import Prestation, Projet

from .geo.build_lot import is_surface_conforme
from .models import STATUT_CHOICES
from .geo.calculations import planar_shoelace_area_m2
from .models import Lot

MAX_BYTES = 5 * 1024 * 1024
MAX_LOTS = 500
MAX_BORNES = 20000

# Canonical field -> accepted header spellings (after normalisation, see `_norm`).
LOT_HEADERS = {
    "titre_foncier": {"titre foncier", "titre", "tf", "n titre", "numero titre", "numero de titre"},
    "propriete_dite": {"propriete dite", "propriete", "nom", "nom propriete", "designation"},
    "lot_number": {"lot", "lot n", "n lot", "numero lot", "numero de lot", "lot no"},
    "affaire_ref": {"reference d affaire", "reference affaire", "ref affaire", "affaire"},
    "geometre": {"geometre", "geometre expert", "topographe"},
    "date_leve": {"date du leve", "date leve", "date levee", "date"},
    "service_cadastre": {"service du cadastre", "service cadastre", "cadastre", "conservation"},
    "projet": {"projet", "code projet", "id projet", "projet id"},
    "prestation": {"prestation", "code prestation", "id prestation", "prestation id"},
    "surface_document": {
        "surface du document m2", "surface document m2", "surface du document", "surface document",
        "contenance adoptee", "contenance", "surface m2", "surface",
    },
    "correction_lambert": {"correction lambert m2", "correction lambert", "correction"},
}
BORNE_HEADERS = {
    "titre_foncier": LOT_HEADERS["titre_foncier"],
    "name": {"borne", "nom borne", "nom de la borne", "point", "nom", "designation"},
    "x": {"x lambert m", "x lambert", "x", "est", "easting"},
    "y": {"y lambert m", "y lambert", "y", "nord", "northing"},
    "order": {"n", "no", "ordre", "sequence", "numero", "num"},
}
SHEET_NAMES = {"lots": {"lots", "lot"}, "bornes": {"bornes", "borne", "points"}}


def _norm(value) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).lower()
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _num(value):
    """Number from a cell: real numbers, or text such as '313 952,15' / '313,952.15'. None if empty/invalid."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    raw = str(value).strip().replace(" ", "").replace(" ", "").replace(" ", "")
    if not raw:
        return None
    if "," in raw and "." in raw:
        raw = raw.replace(",", "")
    else:
        raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = _text(value)
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _find_sheet(wb, key):
    for ws in wb.worksheets:
        if _norm(ws.title) in SHEET_NAMES[key]:
            return ws
    return None


def _header_map(ws, spec):
    """{field: column index} from the first non-empty row; also returns that row number."""
    for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=15, values_only=True), start=1):
        mapping = {}
        for col_idx, cell in enumerate(row):
            n = _norm(cell)
            if not n:
                continue
            for field, names in spec.items():
                if n in names and field not in mapping:
                    mapping[field] = col_idx
        if mapping:
            return mapping, row_idx
    return {}, 0


def _rows(ws, mapping, header_row):
    for row_idx, row in enumerate(ws.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1):
        if row is None or all(c is None or _text(c) == "" for c in row):
            continue
        yield row_idx, {f: (row[i] if i < len(row) else None) for f, i in mapping.items()}


def parse_lots_workbook(file_bytes: bytes) -> dict:
    """Returns {"lots": [...], "warnings": [...]}; raises ValueError for a file that cannot be read at all."""
    try:
        wb = load_workbook(BytesIO(file_bytes), data_only=True, read_only=True)
    except Exception as error:  # noqa: BLE001 - any unreadable file is the same message to the user
        raise ValueError("Fichier illisible : envoyez un classeur Excel (.xlsx).") from error

    ws_lots = _find_sheet(wb, "lots")
    ws_bornes = _find_sheet(wb, "bornes")
    if ws_lots is None or ws_bornes is None:
        raise ValueError("Le classeur doit contenir une feuille « Lots » et une feuille « Bornes » (téléchargez le modèle).")

    lot_map, lot_header = _header_map(ws_lots, LOT_HEADERS)
    for field, label in (("titre_foncier", "Titre foncier"), ("propriete_dite", "Propriété dite"), ("surface_document", "Surface du document")):
        if field not in lot_map:
            raise ValueError(f"Colonne « {label} » introuvable dans la feuille « Lots ».")
    borne_map, borne_header = _header_map(ws_bornes, BORNE_HEADERS)
    for field, label in (("titre_foncier", "Titre foncier"), ("name", "Borne"), ("x", "X Lambert"), ("y", "Y Lambert")):
        if field not in borne_map:
            raise ValueError(f"Colonne « {label} » introuvable dans la feuille « Bornes ».")

    warnings = []

    # ---- bornes grouped by titre foncier (kept in file order, or by the optional N° column)
    bornes_by_titre: dict[str, list[dict]] = {}
    total_bornes = 0
    for row_idx, r in _rows(ws_bornes, borne_map, borne_header):
        titre = _text(r.get("titre_foncier"))
        total_bornes += 1
        if total_bornes > MAX_BORNES:
            raise ValueError(f"Trop de bornes (maximum {MAX_BORNES}).")
        bornes_by_titre.setdefault(titre, []).append(
            {"row": row_idx, "name": _text(r.get("name")), "x": _num(r.get("x")), "y": _num(r.get("y")), "order": _num(r.get("order"))}
        )

    projets = {p.pk for p in Projet.objects.all()}
    lots = []
    seen: set[tuple[str, str]] = set()
    used_titres = set()

    for row_idx, r in _rows(ws_lots, lot_map, lot_header):
        if len(lots) >= MAX_LOTS:
            raise ValueError(f"Trop de lots (maximum {MAX_LOTS}).")
        errors, lot_warnings = [], []
        titre = _text(r.get("titre_foncier"))
        propriete = _text(r.get("propriete_dite"))
        projet_id = _text(r.get("projet"))
        prestation_id = _text(r.get("prestation"))
        surface_doc = _num(r.get("surface_document"))
        correction = _num(r.get("correction_lambert"))
        used_titres.add(titre)

        if not titre:
            errors.append("Titre foncier manquant.")
        if not propriete:
            errors.append("Propriété dite manquante.")
        if surface_doc is None or surface_doc < 0:
            errors.append("Surface du document manquante ou invalide.")
        if correction is None:
            correction = 0.0

        raw_date = r.get("date_leve")
        date_leve = _date(raw_date) if _text(raw_date) or isinstance(raw_date, (date, datetime)) else None
        if _text(raw_date) and date_leve is None:
            lot_warnings.append("Date du levé non reconnue (elle sera ignorée).")

        if projet_id and projet_id not in projets:
            errors.append(f"Projet « {projet_id} » introuvable.")
        elif projet_id:
            if Lot.objects.filter(titre_foncier=titre, projet_id=projet_id).exists():
                errors.append("Ce projet a déjà un lot avec ce titre foncier.")
            if prestation_id:
                belongs = Prestation.objects.filter(pk=prestation_id, projet_id=projet_id).exists()
                if not belongs:
                    errors.append(f"Prestation « {prestation_id} » introuvable dans ce projet.")
        elif prestation_id:
            errors.append("Une prestation demande aussi un projet.")
        elif titre and Lot.objects.filter(titre_foncier=titre).exists():
            lot_warnings.append("Un lot avec ce titre foncier existe déjà (dans un autre projet ou sans projet).")

        key = (titre, projet_id)
        if titre and key in seen:
            errors.append("Doublon dans le fichier : même titre foncier et même projet.")
        seen.add(key)

        # ---- bornes
        raw_bornes = bornes_by_titre.get(titre, [])
        if any(b["order"] is not None for b in raw_bornes):
            raw_bornes = sorted(raw_bornes, key=lambda b: (b["order"] is None, b["order"] or 0, b["row"]))
        bornes = []
        for i, b in enumerate(raw_bornes):
            if b["x"] is None or b["y"] is None:
                errors.append(f"Borne ligne {b['row']} : X ou Y manquant ou invalide.")
                continue
            if abs(b["x"]) < 1000 and abs(b["y"]) < 1000:
                errors.append(f"Borne ligne {b['row']} : ces valeurs ressemblent à des coordonnées géographiques, pas à du Lambert (en mètres).")
                continue
            name = b["name"] or f"B{i + 1}"
            if not b["name"]:
                lot_warnings.append(f"Borne ligne {b['row']} sans nom : « {name} » attribué.")
            bornes.append({"name": name, "sequence": i, "x": b["x"], "y": b["y"]})
        if len(raw_bornes) < 3:
            errors.append("Au moins 3 bornes sont nécessaires (feuille « Bornes »).")

        surface_calc = ecart = None
        conforme = None
        if len(bornes) >= 3 and not any(e.startswith("Borne ligne") for e in errors):
            surface_calc = round(planar_shoelace_area_m2([(b["x"], b["y"]) for b in bornes]), 2)
            if surface_doc is not None:
                ecart = round(surface_calc + correction - surface_doc, 2)
                conforme = is_surface_conforme(surface_calc, correction, surface_doc)
                if not conforme:
                    lot_warnings.append(f"Écart de surface de {ecart:+.2f} m² (tolérance 1 m²) : vérifiez les bornes.")

        lots.append({
            "row": row_idx,
            "titre_foncier": titre,
            "propriete_dite": propriete,
            "lot_number": _text(r.get("lot_number")),
            "affaire_ref": _text(r.get("affaire_ref")),
            "geometre": _text(r.get("geometre")),
            "date_leve": date_leve.isoformat() if date_leve else None,
            "service_cadastre": _text(r.get("service_cadastre")),
            "projet": projet_id,
            "prestation": prestation_id,
            "surface_document_m2": surface_doc,
            "correction_lambert_m2": correction,
            "bornes": bornes,
            "surface_calculee_m2": surface_calc,
            "ecart_m2": ecart,
            "conforme": conforme,
            "errors": errors,
            "warnings": lot_warnings,
        })

    orphans = sorted(t for t in bornes_by_titre if t not in used_titres)
    if orphans:
        warnings.append(f"Bornes ignorées : titre foncier absent de la feuille « Lots » ({', '.join(orphans[:5])}{'…' if len(orphans) > 5 else ''}).")
    if not lots:
        raise ValueError("Aucun lot trouvé dans la feuille « Lots ».")
    return {"lots": lots, "warnings": warnings}


# ---------------------------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------------------------

_INK, _ACCENT, _LINE = "1D1B18", "B3261E", "DDD4C2"


def _header(ws, labels, widths):
    for c, (label, width) in enumerate(zip(labels, widths), start=1):
        cell = ws.cell(row=1, column=c, value=label)
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = PatternFill("solid", fgColor=_INK)
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(c)].width = width
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "A2"
    ws.sheet_view.showGridLines = False


def build_template() -> bytes:
    wb = Workbook()

    ws = wb.active
    ws.title = "Lots"
    _header(ws, [
        "Titre foncier *", "Propriété dite *", "Lot n°", "Référence d'affaire", "Géomètre", "Date du levé",
        "Service du cadastre", "Projet", "Prestation", "Surface du document (m²) *", "Correction Lambert (m²)",
    ], [16, 28, 8, 20, 22, 13, 22, 15, 15, 18, 16])
    ws.append(["TF/12345/R", "Résidence Les Oliviers", "12", "AFF-2026-041", "Cabinet Exemple", date(2026, 9, 1), "Rabat", "", "", 5000, 0])
    ws.append(["TF/67890/C", "Lotissement Al Massira", "3", "", "", None, "", "", "", 4800, 0])
    for row in ws.iter_rows(min_row=2, max_row=3):
        for cell in row:
            cell.border = Border(bottom=Side(style="thin", color=_LINE))
        row[5].number_format = "dd/mm/yyyy"
        row[9].number_format = "#,##0.00"
        row[10].number_format = "#,##0.00"

    wb_b = wb.create_sheet("Bornes")
    _header(wb_b, ["Titre foncier *", "Borne *", "X Lambert (m) *", "Y Lambert (m) *", "N° (facultatif)"], [16, 14, 18, 18, 14])
    rect1 = [("B1", 371000, 385000), ("B2", 371100, 385000), ("B3", 371100, 385050), ("B4", 371000, 385050)]
    rect2 = [("B1", 372000, 386000), ("B2", 372080, 386000), ("B3", 372080, 386060), ("B4", 372000, 386060)]
    for titre, pts in (("TF/12345/R", rect1), ("TF/67890/C", rect2)):
        for i, (name, x, y) in enumerate(pts, start=1):
            wb_b.append([titre, name, x, y, i])
    for row in wb_b.iter_rows(min_row=2):
        for cell in row:
            cell.border = Border(bottom=Side(style="thin", color=_LINE))
        row[2].number_format = "#,##0.000"
        row[3].number_format = "#,##0.000"

    ws_h = wb.create_sheet("Mode d'emploi")
    ws_h.sheet_view.showGridLines = False
    ws_h.column_dimensions["A"].width = 110
    lines = [
        ("Import de lots cadastraux", True),
        ("", False),
        ("1. Feuille « Lots » : une ligne par lot. Obligatoires : Titre foncier, Propriété dite, Surface du document (m²).", False),
        ("2. Feuille « Bornes » : une ligne par borne, avec le Titre foncier du lot, le nom de la borne et ses coordonnées Lambert X / Y en mètres.", False),
        ("   Les bornes se suivent dans l'ordre du contour ; il en faut au moins 3 par lot. La colonne N° permet d'imposer l'ordre.", False),
        ("3. Coordonnées : Lambert Nord Maroc (EPSG:26191), en mètres. Virgule ou point décimal acceptés.", False),
        ("4. Projet et Prestation (facultatifs) : codes existants, par exemple PRJ-2026-008 et PRS-2026-107.", False),
        ("5. La surface calculée est toujours recalculée à partir des bornes ; un écart de plus de 1 m² avec la surface du document est signalé.", False),
        ("6. Les lots sont importés en « brouillon » : le bureau les vérifie, puis le contrôle les valide.", False),
        ("", False),
        ("Les deux lignes d'exemple des feuilles « Lots » et « Bornes » sont à remplacer ou à supprimer.", False),
    ]
    for i, (text, bold) in enumerate(lines, start=1):
        cell = ws_h.cell(row=i, column=1, value=text)
        cell.font = Font(name="Cambria", bold=True, size=14, color=_INK) if bold else Font(size=10, color=_INK)
        cell.alignment = Alignment(wrap_text=True, vertical="top")

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------------------------

def build_lots_export(lots) -> bytes:
    """A workbook of existing lots, in the same "Lots" + "Bornes" shape as the template — so it
    round-trips through parse_lots_workbook unchanged, and doubles as an offline/client copy."""
    wb = Workbook()

    ws = wb.active
    ws.title = "Lots"
    _header(ws, [
        "Titre foncier", "Propriété dite", "Lot n°", "Référence d'affaire", "Géomètre", "Date du levé",
        "Service du cadastre", "Projet", "Prestation", "Surface du document (m²)", "Correction Lambert (m²)",
        "Surface calculée (m²)", "Statut",
    ], [16, 28, 8, 20, 22, 13, 22, 15, 15, 18, 16, 18, 12])
    for lot in lots:
        row = ws.max_row + 1
        ws.append([
            lot.titre_foncier, lot.propriete_dite, lot.lot_number, lot.affaire_ref, lot.geometre,
            lot.date_leve, lot.service_cadastre, lot.projet_id or "", lot.prestation_id or "",
            float(lot.surface_document_m2), float(lot.correction_lambert_m2),
            float(lot.surface_calculee_m2), dict(STATUT_CHOICES).get(lot.statut, lot.statut),
        ])
        for cell in ws[row]:
            cell.border = Border(bottom=Side(style="thin", color=_LINE))
        ws.cell(row=row, column=6).number_format = "dd/mm/yyyy"
        for col in (10, 11, 12):
            ws.cell(row=row, column=col).number_format = "#,##0.00"

    wb_b = wb.create_sheet("Bornes")
    _header(wb_b, ["Titre foncier", "Borne", "X Lambert (m)", "Y Lambert (m)", "N°"], [16, 14, 18, 18, 8])
    for lot in lots:
        for borne in lot.bornes.all().order_by("sequence"):
            row = wb_b.max_row + 1
            wb_b.append([lot.titre_foncier, borne.name, float(borne.x_lambert), float(borne.y_lambert), borne.sequence + 1])
            for cell in wb_b[row]:
                cell.border = Border(bottom=Side(style="thin", color=_LINE))
            wb_b.cell(row=row, column=3).number_format = "#,##0.000"
            wb_b.cell(row=row, column=4).number_format = "#,##0.000"

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
