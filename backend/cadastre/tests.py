from django.test import SimpleTestCase

from .geo.calculations import planar_perimeter_m, planar_shoelace_area_m2
from .pdf.parse_bornes import parse_calcul_de_contenances

# A clean 100 m x 50 m rectangle in Lambert coordinates.
SQUARE = [(500000.0, 300000.0), (500100.0, 300000.0), (500100.0, 300050.0), (500000.0, 300050.0)]


class GeometryTests(SimpleTestCase):
    def test_shoelace_area_of_a_rectangle(self):
        self.assertAlmostEqual(planar_shoelace_area_m2(SQUARE), 5000.0, places=6)

    def test_perimeter_closes_the_ring(self):
        self.assertAlmostEqual(planar_perimeter_m(SQUARE), 300.0, places=6)


class ParserTests(SimpleTestCase):
    def test_parses_borne_rows_in_document_order(self):
        text = "313952,15 B3452 377797,12\n313980,44 B3453 377810,30\n313990,10 B3454 377750,00"
        parsed = parse_calcul_de_contenances(text)
        self.assertEqual([b.name for b in parsed.bornes], ["B3452", "B3453", "B3454"])
        self.assertEqual(parsed.bornes[0].x, 313952.15)
        self.assertEqual(parsed.bornes[0].y, 377797.12)

    def test_flags_a_borne_whose_name_is_not_a_clean_reading(self):
        text = "313952,15 B3452 377797,12\n313980,44 83453 377810,30\n313990,10 B3454 377750,00"
        parsed = parse_calcul_de_contenances(text)
        self.assertTrue(parsed.bornes[1].flagged)

    def test_flags_a_coordinate_with_an_inserted_digit(self):
        text = (
            "313952,15 B3452 377797,12\n"
            "313980,44 B3453 377810,30\n"
            "3139900,10 B3454 377750,00\n"
            "313995,00 B3455 377760,00"
        )
        parsed = parse_calcul_de_contenances(text)
        self.assertTrue(any(b.flagged for b in parsed.bornes))

    def test_a_number_does_not_bleed_across_a_line_break(self):
        text = "P 56\n300602,65 B3452 377797,12"
        parsed = parse_calcul_de_contenances(text)
        self.assertEqual(parsed.bornes[0].x, 300602.65)


# --- Reusing an earlier lot on a new projet --------------------------------

from django.contrib.auth.models import User  # noqa: E402
from django.test import TestCase  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from clients.models import Client  # noqa: E402
from projets.models import Projet  # noqa: E402

from .models import Borne, Lot  # noqa: E402


def _payload(projet_id, titre="TF/1/R"):
    """A minimal valid lot body: three bornes around Rabat, Lambert Nord Maroc."""
    return {
        "projet": projet_id,
        "titre_foncier": titre,
        "propriete_dite": "Terrain test",
        "surface_document_m2": 5000,
        "correction_lambert_m2": 0,
        "bornes": [
            {"name": "B1", "sequence": 1, "x_lambert": 500000.0, "y_lambert": 300000.0},
            {"name": "B2", "sequence": 2, "x_lambert": 500100.0, "y_lambert": 300000.0},
            {"name": "B3", "sequence": 3, "x_lambert": 500100.0, "y_lambert": 300050.0},
            {"name": "B4", "sequence": 4, "x_lambert": 500000.0, "y_lambert": 300050.0},
        ],
    }


class LotReuseTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        client = Client.objects.create(id="CLI-T1", nom="Client test")
        cls.p1 = Projet.objects.create(id="PRJ-T-1", client=client, reference_fonciere="TF/1/R")
        cls.p2 = Projet.objects.create(id="PRJ-T-2", client=client, reference_fonciere="TF/1/R")
        cls.user = User.objects.create_user("tester", password="x")

    def setUp(self):
        self.api = APIClient(SERVER_NAME="localhost")
        self.api.force_authenticate(self.user)

    def _create_lot(self, projet):
        r = self.api.post("/api/cadastre/lots/", _payload(projet.id if projet else None), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return Lot.objects.get(pk=r.json()["id"])

    def test_same_titre_is_allowed_on_another_projet_but_not_twice_on_one(self):
        self._create_lot(self.p1)
        self.assertEqual(self.api.post("/api/cadastre/lots/", _payload(self.p2.id), format="json").status_code, 201)
        dup = self.api.post("/api/cadastre/lots/", _payload(self.p1.id), format="json")
        self.assertEqual(dup.status_code, 400)

    def test_matches_finds_same_titre_and_skips_the_target_projet(self):
        self._create_lot(self.p1)
        found = self.api.get("/api/cadastre/lots/matches/?titre=TF/1/R&projet=PRJ-T-2").json()
        self.assertEqual(len(found["same_titre"]), 1)
        self.assertEqual(found["same_titre"][0]["nb_bornes"], 4)
        own = self.api.get("/api/cadastre/lots/matches/?titre=TF/1/R&projet=PRJ-T-1").json()
        self.assertEqual(own["same_titre"], [])

    def test_matches_finds_nearby_lots_by_distance(self):
        lot = self._create_lot(self.p1)
        b = lot.bornes.first()
        near = self.api.get(f"/api/cadastre/lots/matches/?lat={b.lat}&lng={b.lng}&radius=200").json()
        self.assertEqual([m["id"] for m in near["nearby"]], [str(lot.id)])
        far = self.api.get("/api/cadastre/lots/matches/?lat=35.0&lng=-5.0&radius=200").json()
        self.assertEqual(far["nearby"], [])

    def test_overview_geojson_carries_status_and_conformity(self):
        lot = self._create_lot(self.p1)
        data = self.api.get("/api/cadastre/lots/geojson/").json()
        props = next(f["properties"] for f in data["features"] if f["properties"]["id"] == str(lot.id))
        self.assertEqual(props["statut"], "brouillon")
        self.assertIn("conforme", props)
        self.assertEqual(props["projetId"], self.p1.id)
        self.assertGreater(props["surfaceCalculeeM2"], 0)

    def test_reuse_copies_a_lot_owned_by_another_projet(self):
        source = self._create_lot(self.p1)
        r = self.api.post(f"/api/cadastre/lots/{source.id}/reuse/", {"projet": self.p2.id}, format="json")
        self.assertEqual((r.status_code, r.json()["mode"]), (201, "copied"))
        copy = Lot.objects.get(pk=r.json()["id"])
        self.assertEqual(copy.projet_id, self.p2.id)
        self.assertEqual(copy.derive_de_id, source.id)
        self.assertEqual(Borne.objects.filter(lot=copy).count(), 4)
        self.assertEqual(self.api.get(f"/api/cadastre/lots/{copy.id}/geojson/").status_code, 200)
        source.refresh_from_db()
        self.assertEqual(source.projet_id, self.p1.id)

    def test_reuse_twice_returns_the_existing_copy(self):
        source = self._create_lot(self.p1)
        first = self.api.post(f"/api/cadastre/lots/{source.id}/reuse/", {"projet": self.p2.id}, format="json").json()
        again = self.api.post(f"/api/cadastre/lots/{source.id}/reuse/", {"projet": self.p2.id}, format="json").json()
        self.assertEqual((again["mode"], again["id"]), ("existing", first["id"]))

    def test_reuse_attaches_a_lot_that_has_no_projet(self):
        orphan = self._create_lot(None)
        r = self.api.post(f"/api/cadastre/lots/{orphan.id}/reuse/", {"projet": self.p2.id}, format="json").json()
        self.assertEqual((r["mode"], r["id"]), ("attached", str(orphan.id)))
        orphan.refresh_from_db()
        self.assertEqual(orphan.projet_id, self.p2.id)


# --- Prestation link, author and review status -----------------------------

import tempfile  # noqa: E402

from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from django.test import override_settings  # noqa: E402
from employees.models import Employee  # noqa: E402
from projets.models import HistoryEntry, Prestation  # noqa: E402


class LotReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        client = Client.objects.create(id="CLI-T2", nom="Client test")
        cls.projet = Projet.objects.create(id="PRJ-T-3", client=client)
        cls.other = Projet.objects.create(id="PRJ-T-4", client=client)
        cls.prestation = Prestation.objects.create(id="PRS-T-1", projet=cls.projet)
        cls.bureau_user = User.objects.create_user("bureau", password="x")
        Employee.objects.create(id="EMP-T1", nom="Marc Bureau", role="Agent Bureau", user=cls.bureau_user)
        cls.chantier_user = User.objects.create_user("chantier", password="x")
        Employee.objects.create(id="EMP-T2", nom="Paul Chantier", role="Agent Chantier", user=cls.chantier_user)
        cls.controle_user = User.objects.create_user("controle", password="x")
        Employee.objects.create(id="EMP-T3", nom="Jean Controle", role="Agent Contrôle", user=cls.controle_user)

    def _as(self, user):
        api = APIClient(SERVER_NAME="localhost")
        api.force_authenticate(user)
        return api

    def _lot(self, api, **extra):
        body = {**_payload(self.projet.id, "TF/9/R"), "prestation": self.prestation.id, **extra}
        r = api.post("/api/cadastre/lots/", body, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["id"]

    def test_lot_records_prestation_and_author(self):
        lot_id = self._lot(self._as(self.bureau_user))
        d = self._as(self.bureau_user).get(f"/api/cadastre/lots/{lot_id}/").json()
        self.assertEqual((d["prestation"], d["created_by_name"], d["statut"]), (self.prestation.id, "Marc Bureau", "brouillon"))

    def test_prestation_must_belong_to_the_projet(self):
        body = {**_payload(self.other.id, "TF/9/R"), "prestation": self.prestation.id}
        self.assertEqual(self._as(self.bureau_user).post("/api/cadastre/lots/", body, format="json").status_code, 400)

    def test_review_flow_and_roles(self):
        lot_id = self._lot(self._as(self.bureau_user))
        url = f"/api/cadastre/lots/{lot_id}/statut/"
        # chantier cannot verify, bureau cannot validate, validation needs a verified lot first
        self.assertEqual(self._as(self.chantier_user).post(url, {"statut": "verifie"}, format="json").status_code, 403)
        self.assertEqual(self._as(self.controle_user).post(url, {"statut": "valide"}, format="json").status_code, 400)
        r = self._as(self.bureau_user).post(url, {"statut": "verifie"}, format="json")
        self.assertEqual((r.status_code, r.json()["statut_par_name"]), (200, "Marc Bureau"))
        self.assertEqual(self._as(self.bureau_user).post(url, {"statut": "valide"}, format="json").status_code, 403)
        self.assertEqual(self._as(self.controle_user).post(url, {"statut": "valide"}, format="json").json()["statut"], "valide")

    def test_editing_a_lot_sends_it_back_to_brouillon(self):
        api = self._as(self.bureau_user)
        lot_id = self._lot(api)
        api.post(f"/api/cadastre/lots/{lot_id}/statut/", {"statut": "verifie"}, format="json")
        body = {**_payload(self.projet.id, "TF/9/R"), "prestation": self.prestation.id, "propriete_dite": "Modifié"}
        self.assertEqual(api.put(f"/api/cadastre/lots/{lot_id}/", body, format="json").json()["statut"], "brouillon")

    def _history(self):
        return list(HistoryEntry.objects.filter(prestation=self.prestation).values_list("label", "author"))

    def test_lot_events_are_logged_on_the_prestation(self):
        bureau, controle = self._as(self.bureau_user), self._as(self.controle_user)
        lot_id = self._lot(bureau)
        url = f"/api/cadastre/lots/{lot_id}/statut/"
        bureau.post(url, {"statut": "verifie"}, format="json")
        bureau.post(url, {"statut": "verifie"}, format="json")  # no change, no entry
        controle.post(url, {"statut": "valide"}, format="json")
        bureau.post(url, {"statut": "chantier"}, format="json")  # refused, no entry
        body = {**_payload(self.projet.id, "TF/9/R"), "prestation": self.prestation.id}
        bureau.put(f"/api/cadastre/lots/{lot_id}/", body, format="json")
        bureau.put(f"/api/cadastre/lots/{lot_id}/", body, format="json")
        bureau.delete(f"/api/cadastre/lots/{lot_id}/")

        self.assertEqual(self._history(), [
            ("Lot cadastral enregistré — TF TF/9/R", "Marc Bureau"),
            ("Lot cadastral vérifié — TF TF/9/R", "Marc Bureau"),
            ("Lot cadastral validé — TF TF/9/R", "Jean Controle"),
            ("Lot cadastral modifié (repasse en brouillon) — TF TF/9/R", "Marc Bureau"),
            ("Lot cadastral modifié — TF TF/9/R", "Marc Bureau"),
            ("Lot cadastral supprimé — TF TF/9/R", "Marc Bureau"),
        ])
        date = HistoryEntry.objects.filter(prestation=self.prestation).first().date
        self.assertRegex(date, r"^\d{2}/\d{2}/\d{4}$")

    def test_lot_without_prestation_logs_nothing(self):
        api = self._as(self.bureau_user)
        r = api.post("/api/cadastre/lots/", _payload(self.projet.id, "TF/10/R"), format="json")
        api.post(f"/api/cadastre/lots/{r.json()['id']}/statut/", {"statut": "verifie"}, format="json")
        self.assertEqual(HistoryEntry.objects.count(), 0)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AttachmentAndBoundaryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        client = Client.objects.create(id="CLI-T3", nom="Client test")
        cls.projet = Projet.objects.create(id="PRJ-T-5", client=client)
        cls.prestation = Prestation.objects.create(id="PRS-T-2", projet=cls.projet)
        cls.user = User.objects.create_user("uploader", password="x")

    def setUp(self):
        self.api = APIClient(SERVER_NAME="localhost")
        self.api.force_authenticate(self.user)

    def test_upload_file_and_network_path_show_up_on_the_projet_and_prestation(self):
        f = SimpleUploadedFile("plan.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        r = self.api.post("/api/attachments/", {"content_type_model_input": "projet", "object_id": self.projet.id, "label": "Plan", "file": f}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        r2 = self.api.post("/api/attachments/", {"content_type_model_input": "prestation", "object_id": self.prestation.id, "chemin": "//SRV/projets/x", "type": "livrable"}, format="json")
        self.assertEqual(r2.status_code, 201, r2.content)
        projet = self.api.get("/api/projets/PRJ-T-5/").json()
        self.assertEqual((projet["attachments"][0]["label"], projet["attachments"][0]["size"]), ("Plan", 13))
        self.assertEqual(projet["attachments"][0]["name"].endswith(".pdf"), True)
        self.assertEqual(projet["prestations"][0]["attachments"][0]["chemin"], "//SRV/projets/x")

    def test_attachment_needs_a_file_or_a_path(self):
        r = self.api.post("/api/attachments/", {"content_type_model_input": "projet", "object_id": self.projet.id}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_projet_boundary_round_trips(self):
        ring = {"type": "Polygon", "coordinates": [[[-6.8, 33.9], [-6.79, 33.9], [-6.79, 33.91], [-6.8, 33.9]]]}
        self.assertEqual(self.api.patch("/api/projets/PRJ-T-5/", {"boundary": ring}, format="json").status_code, 200)
        self.assertEqual(self.api.get("/api/projets/PRJ-T-5/").json()["boundary"], ring)


class ExcelImportTests(TestCase):
    """Import of lots from an Excel workbook: reading, validation, the template."""

    @classmethod
    def setUpTestData(cls):
        client = Client.objects.create(id="CLI-X1", nom="Client Excel")
        cls.projet = Projet.objects.create(id="PRJ-X-1", client=client, reference_fonciere="TF/9/R")
        cls.user = User.objects.create_user("xl", password="x")

    def setUp(self):
        self.api = APIClient(SERVER_NAME="localhost")
        self.api.force_authenticate(self.user)

    @staticmethod
    def _xlsx(lots, bornes, lot_header=None, borne_header=None):
        from io import BytesIO

        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Lots"
        ws.append(lot_header or ["Titre foncier", "Propriété dite", "Projet", "Surface du document (m²)", "Correction Lambert (m²)"])
        for row in lots:
            ws.append(row)
        wb_b = wb.create_sheet("Bornes")
        wb_b.append(borne_header or ["Titre foncier", "Borne", "X Lambert (m)", "Y Lambert (m)"])
        for row in bornes:
            wb_b.append(row)
        buf = BytesIO()
        wb.save(buf)
        return buf.getvalue()

    RECT = [("B1", 371000, 385000), ("B2", 371100, 385000), ("B3", 371100, 385050), ("B4", 371000, 385050)]

    def _bornes(self, titre, pts=None):
        return [[titre, n, x, y] for n, x, y in (pts or self.RECT)]

    def test_template_reads_back_without_errors(self):
        from .excel_import import build_template, parse_lots_workbook

        result = parse_lots_workbook(build_template())
        self.assertEqual([l["titre_foncier"] for l in result["lots"]], ["TF/12345/R", "TF/67890/C"])
        for lot in result["lots"]:
            self.assertEqual(lot["errors"], [], lot)
            self.assertTrue(lot["conforme"])
        self.assertEqual(result["lots"][0]["surface_calculee_m2"], 5000.0)
        self.assertEqual(result["lots"][1]["surface_calculee_m2"], 4800.0)

    def test_reads_a_lot_and_recomputes_the_surface(self):
        from .excel_import import parse_lots_workbook

        data = self._xlsx([["TF/1/R", "Terrain A", "", 5000, 0]], self._bornes("TF/1/R"))
        lot = parse_lots_workbook(data)["lots"][0]
        self.assertEqual((lot["errors"], lot["surface_calculee_m2"], lot["ecart_m2"], lot["conforme"]), ([], 5000.0, 0.0, True))
        self.assertEqual([b["name"] for b in lot["bornes"]], ["B1", "B2", "B3", "B4"])
        self.assertEqual([b["sequence"] for b in lot["bornes"]], [0, 1, 2, 3])

    def test_surface_gap_is_a_warning_not_an_error(self):
        from .excel_import import parse_lots_workbook

        lot = parse_lots_workbook(self._xlsx([["TF/1/R", "Terrain A", "", 5100, 0]], self._bornes("TF/1/R")))["lots"][0]
        self.assertEqual(lot["errors"], [])
        self.assertFalse(lot["conforme"])
        self.assertTrue(any("Écart de surface" in w for w in lot["warnings"]))

    def test_accepts_text_numbers_with_comma_and_spaces(self):
        from .excel_import import parse_lots_workbook

        bornes = [["TF/1/R", n, f"{x:,}".replace(",", " ") + ",0", str(y)] for n, x, y in self.RECT]
        lot = parse_lots_workbook(self._xlsx([["TF/1/R", "Terrain A", "", "5 000,00", ""]], bornes))["lots"][0]
        self.assertEqual(lot["errors"], [])
        self.assertEqual(lot["surface_document_m2"], 5000.0)
        self.assertEqual(lot["bornes"][0]["x"], 371000.0)

    def test_header_spelling_is_forgiving(self):
        from .excel_import import parse_lots_workbook

        data = self._xlsx(
            [["TF/1/R", "Terrain A", 5000]], [["TF/1/R", n, x, y] for n, x, y in self.RECT],
            lot_header=["TITRE  foncier *", "propriete dite", "Contenance adoptée"],
            borne_header=["titre", "Nom", "X", "Y"],
        )
        self.assertEqual(parse_lots_workbook(data)["lots"][0]["errors"], [])

    def test_bad_rows_are_reported_per_lot(self):
        from .excel_import import parse_lots_workbook

        lots = [
            ["TF/2/R", "Deux bornes", "", 100, 0],
            ["TF/3/R", "Projet inconnu", "PRJ-NOPE", 5000, 0],
            ["TF/4/R", "", "", 5000, 0],
            ["TF/5/R", "Surface absente", "", None, 0],
            ["TF/6/R", "Lat lng", "", 5000, 0],
        ]
        bornes = (
            self._bornes("TF/2/R", self.RECT[:2]) + self._bornes("TF/3/R") + self._bornes("TF/4/R") + self._bornes("TF/5/R")
            + [["TF/6/R", "B1", 33.9, -6.8], ["TF/6/R", "B2", 33.91, -6.8], ["TF/6/R", "B3", 33.91, -6.79]]
        )
        by_titre = {l["titre_foncier"]: l for l in parse_lots_workbook(self._xlsx(lots, bornes))["lots"]}
        self.assertTrue(any("3 bornes" in e for e in by_titre["TF/2/R"]["errors"]))
        self.assertTrue(any("introuvable" in e for e in by_titre["TF/3/R"]["errors"]))
        self.assertTrue(any("Propriété" in e for e in by_titre["TF/4/R"]["errors"]))
        self.assertTrue(any("Surface" in e for e in by_titre["TF/5/R"]["errors"]))
        self.assertTrue(any("géographiques" in e for e in by_titre["TF/6/R"]["errors"]))

    def test_duplicate_titre_in_the_file_and_in_the_projet(self):
        from .excel_import import parse_lots_workbook

        payload = _payload(self.projet.id)
        payload["titre_foncier"] = "TF/EXIST/R"
        self.assertEqual(self.api.post("/api/cadastre/lots/", payload, format="json").status_code, 201)
        lots = [
            ["TF/EXIST/R", "Déjà là", self.projet.id, 5000, 0],
            ["TF/7/R", "Premier", "", 5000, 0],
            ["TF/7/R", "Second", "", 5000, 0],
        ]
        bornes = self._bornes("TF/EXIST/R") + self._bornes("TF/7/R")
        result = parse_lots_workbook(self._xlsx(lots, bornes))["lots"]
        self.assertTrue(any("déjà un lot" in e for e in result[0]["errors"]))
        self.assertEqual(result[1]["errors"], [])
        self.assertTrue(any("Doublon" in e for e in result[2]["errors"]))

    def test_bornes_without_a_lot_are_reported(self):
        from .excel_import import parse_lots_workbook

        data = self._xlsx([["TF/1/R", "A", "", 5000, 0]], self._bornes("TF/1/R") + self._bornes("TF/ORPHELIN"))
        self.assertTrue(any("TF/ORPHELIN" in w for w in parse_lots_workbook(data)["warnings"]))

    def test_unreadable_or_incomplete_workbooks_are_refused(self):
        from .excel_import import parse_lots_workbook

        with self.assertRaises(ValueError):
            parse_lots_workbook(b"not an excel file")
        with self.assertRaises(ValueError):
            parse_lots_workbook(self._xlsx([], []))

    def test_endpoint_parses_and_the_reviewed_lot_can_then_be_created(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        data = self._xlsx([["TF/API/R", "Via l'API", self.projet.id, 5000, 0]], self._bornes("TF/API/R"))
        upload = SimpleUploadedFile("lots.xlsx", data, content_type="application/octet-stream")
        res = self.api.post("/api/cadastre/lots/parse-excel/", {"file": upload}, format="multipart")
        self.assertEqual(res.status_code, 200, res.content)
        lot = res.json()["lots"][0]
        self.assertEqual(lot["errors"], [])
        created = self.api.post("/api/cadastre/lots/", {
            "projet": lot["projet"], "titre_foncier": lot["titre_foncier"], "propriete_dite": lot["propriete_dite"],
            "surface_document_m2": lot["surface_document_m2"], "correction_lambert_m2": lot["correction_lambert_m2"],
            "bornes": [{"name": b["name"], "sequence": b["sequence"], "x_lambert": b["x"], "y_lambert": b["y"]} for b in lot["bornes"]],
        }, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(Lot.objects.get(pk=created.json()["id"]).statut, "brouillon")

    def test_endpoint_refuses_other_file_types_and_anonymous_users(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        bad = SimpleUploadedFile("lots.csv", b"a,b", content_type="text/csv")
        self.assertEqual(self.api.post("/api/cadastre/lots/parse-excel/", {"file": bad}, format="multipart").status_code, 400)
        self.assertEqual(self.api.post("/api/cadastre/lots/parse-excel/", {}, format="multipart").status_code, 400)
        anon = APIClient(SERVER_NAME="localhost")
        self.assertIn(anon.get("/api/cadastre/lots/excel-template/").status_code, (401, 403))

    def test_template_download(self):
        res = self.api.get("/api/cadastre/lots/excel-template/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("spreadsheetml", res["Content-Type"])
        self.assertIn("modele-import-lots.xlsx", res["Content-Disposition"])
