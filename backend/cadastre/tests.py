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
