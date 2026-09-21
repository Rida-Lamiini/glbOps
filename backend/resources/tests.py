from django.contrib.auth.models import User
from rest_framework.test import APIClient
from django.test import TestCase

from employees.models import Employee
from resources.models import Resource


class VehiculePapiersTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user("bureau", password="x"))
        self.driver = Employee.objects.create(id="EMP-900", nom="Pierre Test", role="Agent Chantier")
        Resource.objects.create(id="VEH-900", nom="4x4 test", type="vehicule")

    def test_papers_round_trip(self):
        payload = {
            "assurance_compagnie": "Wafa Assurance",
            "assurance_police": "P-2026-77",
            "assurance_debut": "2026-01-15",
            "assurance_echeance": "2027-01-14",
            "assurance_prime": "6 800 MAD",
            "visite_technique_derniere": "2026-03-04",
            "visite_technique_prochaine": "2027-03-04",
            "vignette_paiement": "2026-01-20",
            "vignette_echeance": "2027-01-31",
            "kilometrage": 84200,
            "kilometrage_date": "2026-09-18",
            "entretien_prochain_date": "2026-11-15",
            "entretien_prochain_km": 90000,
            "carburant": "diesel",
            "carte_carburant": "CC-4471",
            "conducteur": "EMP-900",
        }
        res = self.client.patch("/api/resources/VEH-900/", payload, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        got = self.client.get("/api/resources/VEH-900/").json()
        for key, value in payload.items():
            self.assertEqual(got[key], value, key)

    def test_papers_are_optional_and_clearable(self):
        self.client.patch("/api/resources/VEH-900/", {"assurance_echeance": "2027-01-14", "kilometrage": 100}, format="json")
        res = self.client.patch("/api/resources/VEH-900/", {"assurance_echeance": None, "kilometrage": None}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        got = res.json()
        self.assertIsNone(got["assurance_echeance"])
        self.assertIsNone(got["kilometrage"])

    def test_unknown_fuel_is_rejected(self):
        res = self.client.patch("/api/resources/VEH-900/", {"carburant": "hydrogene"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_deleting_the_driver_keeps_the_vehicle(self):
        self.client.patch("/api/resources/VEH-900/", {"conducteur": "EMP-900"}, format="json")
        self.driver.delete()
        self.assertIsNone(Resource.objects.get(id="VEH-900").conducteur)

    def test_create_resource_from_the_ui_payload(self):
        res = self.client.post("/api/resources/", {"id": "VEH-901", "nom": "Pick-up", "type": "vehicule"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)

    def test_maintenance_log_entry(self):
        res = self.client.post("/api/maintenance-log/", {"resource": "VEH-900", "date": "2026-09-01", "label": "Vidange"}, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(len(self.client.get("/api/resources/VEH-900/").json()["maintenance_log"]), 1)


class SortieRetourTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.user = User.objects.create_user("agent", password="x")
        self.employee = Employee.objects.create(id="EMP-901", nom="Sara Test", role="Agent Chantier", user=self.user)
        self.api.force_authenticate(self.user)
        Resource.objects.create(id="VEH-910", nom="4x4", type="vehicule", kilometrage=1000)
        Resource.objects.create(id="MAT-910", nom="Station", type="station_totale")
        Resource.objects.create(id="MAT-911", nom="Drone", type="drone", status="maintenance")

    def post(self, rid, payload):
        return self.api.post(f"/api/resources/{rid}/movements/", payload, format="json")

    def test_sortie_then_retour(self):
        res = self.post("MAT-910", {"kind": "sortie", "note": "Chantier Salé"})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["sortie_courante"]["par_nom"], "Sara Test")
        listed = self.api.get("/api/resources/MAT-910/").json()
        self.assertEqual(listed["sortie_courante"]["note"], "Chantier Salé")
        self.assertEqual(self.post("MAT-910", {"kind": "retour"}).status_code, 201)
        self.assertIsNone(self.api.get("/api/resources/MAT-910/").json()["sortie_courante"])

    def test_cannot_check_out_twice(self):
        self.post("MAT-910", {"kind": "sortie"})
        res = self.post("MAT-910", {"kind": "sortie"})
        self.assertEqual(res.status_code, 409)
        self.assertIn("Sara Test", res.json()["detail"])

    def test_cannot_return_what_is_not_out(self):
        self.assertEqual(self.post("MAT-910", {"kind": "retour"}).status_code, 400)

    def test_resource_in_maintenance_cannot_go_out(self):
        res = self.post("MAT-911", {"kind": "sortie"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("maintenance", res.json()["detail"].lower())

    def test_vehicle_mileage_is_updated_on_return(self):
        self.post("VEH-910", {"kind": "sortie", "kilometrage": 1000})
        res = self.post("VEH-910", {"kind": "retour", "kilometrage": 1180})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["kilometrage"], 1180)
        self.assertEqual(Resource.objects.get(id="VEH-910").kilometrage, 1180)

    def test_equipment_ignores_mileage(self):
        self.post("MAT-910", {"kind": "sortie", "kilometrage": 55})
        self.assertIsNone(Resource.objects.get(id="MAT-910").kilometrage)

    def test_history_lists_newest_first(self):
        self.post("MAT-910", {"kind": "sortie"})
        self.post("MAT-910", {"kind": "retour"})
        rows = self.api.get("/api/resources/MAT-910/movements/").json()
        self.assertEqual([r["kind"] for r in rows], ["retour", "sortie"])

    def test_anonymous_cannot_record(self):
        res = APIClient().post("/api/resources/MAT-910/movements/", {"kind": "sortie"}, format="json")
        self.assertIn(res.status_code, (401, 403))

    def test_unknown_kind_is_rejected(self):
        self.assertEqual(self.post("MAT-910", {"kind": "vol"}).status_code, 400)
