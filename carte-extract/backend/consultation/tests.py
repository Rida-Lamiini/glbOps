import io

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient

from cadastre.geo.proj import lambert_to_wgs84
from clients.models import Client
from employees.models import Employee
from projets.models import Prestation, Projet

from . import notifications
from .geo import circle_geojson, compass, haversine_m, route_order
from .models import Consultation, ProximityNotification, SeenProjet
from .parsers import ParseError, parse_bytes, parse_text

# The ANCFCC "consultation de la mappe" page for T98525/03 (Rabat Hassan-Ryad), as copied from the browser.
ANCFCC = """Référence foncière : T98525/03
Surface : 19 a 45 ca
B14 X : 369020.33 Y : 371666.77
B15 X : 369044.25 Y : 371645.55
B28 X : 369084.01 Y : 371690.32
B29 X : 369061.44 Y : 371712.96
B30 X : 369062.85 Y : 371711.54
"""


class ParserTests(SimpleTestCase):
    def test_ancfcc_text_gives_one_polygon_with_titre_and_surface(self):
        (p,) = parse_text(ANCFCC)
        self.assertEqual(p.titre, "T98525/03")
        self.assertEqual(p.kind, "polygon")
        self.assertEqual([b["name"] for b in p.bornes], ["B14", "B15", "B28", "B29", "B30"])
        self.assertEqual(p.declared_surface_m2, 1945)
        # Rabat is around 34.0 N, 6.8 W
        self.assertTrue(33.9 < p.bornes[0]["lat"] < 34.1 and -6.95 < p.bornes[0]["lng"] < -6.7)

    def test_csv_with_header_semicolon_and_decimal_comma(self):
        data = "borne;x;y\nB1;369020,33;371666,77\nB2;369044,25;371645,55\nB3;369084,01;371690,32\n".encode()
        (p,), _ = parse_bytes("bornes.csv", data)
        self.assertEqual(len(p.bornes), 3)
        self.assertEqual(p.bornes[0]["x"], 369020.33)

    def test_csv_with_parcel_column_groups_parcels(self):
        rows = "parcelle,lat,lng\nA,34.0,-6.8\nA,34.001,-6.8\nA,34.001,-6.799\nB,34.01,-6.8\n"
        parcels, _ = parse_bytes("p.csv", rows.encode())
        self.assertEqual({p.name: p.kind for p in parcels}, {"A": "polygon", "B": "point"})

    def test_points_mode_makes_one_parcel_per_row(self):
        parcels, _ = parse_bytes("p.txt", b"B1 369020.33 371666.77\nB2 369044.25 371645.55\n", mode="points")
        self.assertEqual([p.kind for p in parcels], ["point", "point"])

    def test_wgs84_and_lambert_are_told_apart(self):
        parcels, _ = parse_bytes("a.csv", b"x,y\n34.0,-6.8\n369020.33,371666.77\n", mode="points")
        self.assertIsNone(parcels[0].bornes[0]["x"])
        self.assertEqual(parcels[1].bornes[0]["x"], 369020.33)

    def test_geojson_and_kml_and_gpx(self):
        gj = b'{"type":"Feature","properties":{"titre":"T1"},"geometry":{"type":"Polygon","coordinates":[[[-6.8,34.0],[-6.79,34.0],[-6.79,34.01],[-6.8,34.0]]]}}'
        (p,), _ = parse_bytes("a.geojson", gj)
        self.assertEqual((p.name, p.kind, len(p.bornes)), ("T1", "polygon", 3))
        kml = b'<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>K</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-6.8,34 -6.79,34 -6.79,34.01 -6.8,34</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>'
        (k,), _ = parse_bytes("a.kml", kml)
        self.assertEqual((k.name, k.kind), ("K", "polygon"))
        gpx = b'<gpx><wpt lat="34.0" lon="-6.8"><name>W1</name></wpt></gpx>'
        (w,), _ = parse_bytes("a.gpx", gpx)
        self.assertEqual((w.name, w.kind), ("W1", "point"))

    def test_xlsx(self):
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["Borne", "X", "Y"])
        for i, (x, y) in enumerate([(369020.33, 371666.77), (369044.25, 371645.55), (369084.01, 371690.32)], 1):
            ws.append([f"B{i}", x, y])
        buf = io.BytesIO()
        wb.save(buf)
        (p,), _ = parse_bytes("b.xlsx", buf.getvalue())
        self.assertEqual(len(p.bornes), 3)

    def test_nothing_usable_raises_a_french_error(self):
        with self.assertRaises(ParseError):
            parse_bytes("x.txt", b"hello world")


class GeoTests(SimpleTestCase):
    def test_compass_and_distance(self):
        self.assertEqual(compass(0), "N")
        self.assertEqual(compass(92), "E")
        self.assertEqual(compass(200), "S")
        self.assertAlmostEqual(haversine_m(34.0, -6.8, 34.001, -6.8), 111.2, delta=0.5)

    def test_circle_radius(self):
        ring = circle_geojson(34.0, -6.8, 100)["coordinates"][0]
        self.assertAlmostEqual(haversine_m(34.0, -6.8, ring[0][1], ring[0][0]), 100, delta=1)

    def test_route_visits_everything_and_beats_the_given_order(self):
        pts = [(34.0, -6.8), (34.0, -6.78), (34.0, -6.79), (34.0, -6.77), (34.0, -6.76)]
        order = route_order(pts)
        self.assertEqual(sorted(order), [0, 1, 2, 3, 4])
        self.assertEqual(order, [0, 2, 1, 3, 4])


def _boundary(x, y, w=40, h=40):
    ring = [lambert_to_wgs84(x + dx, y + dy, "nord") for dx, dy in [(0, 0), (w, 0), (w, h), (0, h), (0, 0)]]
    return {"type": "Polygon", "coordinates": [[[lng, lat] for lat, lng in ring]]}


class ApiTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.client_ = Client.objects.create(id="CLI-C1", nom="Client Test")
        # P1: delivered survey whose boundary is the ANCFCC parcel area; P2: a pin ~80 m east; P3: far away.
        cls.p1 = Projet.objects.create(id="PRJ-C-1", client=cls.client_, reference_fonciere="T98525/03", boundary=_boundary(369020, 371645))
        lat, lng = lambert_to_wgs84(369160, 371665, "nord")
        cls.p2 = Projet.objects.create(id="PRJ-C-2", client=cls.client_, reference_fonciere="T55555/03", lat=lat, lng=lng)
        lat, lng = lambert_to_wgs84(375000, 380000, "nord")
        cls.p3 = Projet.objects.create(id="PRJ-C-3", client=cls.client_, reference_fonciere="T1/03", lat=lat, lng=lng)
        Prestation.objects.create(id="PRE-C-1", projet=cls.p1, nature_demandee="Bornage", stage="livraison")
        Prestation.objects.create(id="PRE-C-2", projet=cls.p2, nature_demandee="Bornage", stage="execution")
        cls.office = User.objects.create_user("dispatch", password="x")
        Employee.objects.create(id="EMP-C-1", user=cls.office, nom="Dispatcher", role="Dispatcher")
        cls.agent = User.objects.create_user("agent", password="x")
        emp = Employee.objects.create(id="EMP-C-2", user=cls.agent, nom="Agent", role="Agent chantier")
        Prestation.objects.get(pk="PRE-C-2").agent_chantier.add(emp)

    def api(self, user):
        c = APIClient(SERVER_NAME="localhost")
        c.force_authenticate(user)
        return c


class ConsultTests(ApiTestCase):
    def test_position_inside_a_delivered_survey_warns_danger(self):
        lat, lng = lambert_to_wgs84(369040, 371665, "nord")
        r = self.api(self.office).post("/api/consultation/consult/", {"lat": lat, "lng": lng, "radius": 200}, format="json").json()
        first = r["neighbours"][0]
        self.assertEqual((first["projet_id"], first["relation"]), ("PRJ-C-1", "dans"))
        self.assertEqual(r["summary"]["status"], "danger")
        self.assertEqual(r["alerts"][0]["kind"], "overlap")
        self.assertNotIn("PRJ-C-3", [n["projet_id"] for n in r["neighbours"]])

    def test_lambert_input_and_neighbour_distance(self):
        r = self.api(self.office).post("/api/consultation/consult/", {"x": 369200, "y": 371665, "zone": "nord", "radius": 100}, format="json").json()
        ids = {n["projet_id"]: n for n in r["neighbours"]}
        self.assertAlmostEqual(ids["PRJ-C-2"]["distance_m"], 40, delta=1.5)
        self.assertEqual(ids["PRJ-C-2"]["direction"], "O")
        self.assertEqual(ids["PRJ-C-2"]["relation"], "proche")

    def test_same_titre_alert_even_outside_the_radius(self):
        r = self.api(self.office).post("/api/consultation/consult/", {"x": 375000, "y": 380050, "zone": "nord", "radius": 50, "titre": "t 98525/03"}, format="json").json()
        self.assertEqual(r["alerts"][0]["kind"], "same_titre")
        self.assertEqual(r["alerts"][0]["severity"], "danger")
        self.assertEqual(r["neighbours"][-1]["relation"], "titre")

    def test_polygon_ring_reports_overlap_area(self):
        ring = [list(lambert_to_wgs84(369030 + dx, 371655 + dy, "nord")) for dx, dy in [(0, 0), (20, 0), (20, 20), (0, 20)]]
        r = self.api(self.office).post("/api/consultation/consult/", {"ring": ring, "radius": 100}, format="json").json()
        n = next(x for x in r["neighbours"] if x["projet_id"] == "PRJ-C-1")
        self.assertEqual(n["relation"], "dans")
        self.assertAlmostEqual(n["overlap_m2"], 400, delta=10)

    def test_bad_input_is_a_400(self):
        self.assertEqual(self.api(self.office).post("/api/consultation/consult/", {}, format="json").status_code, 400)

    def test_agent_only_sees_their_projets_and_history_is_scoped(self):
        r = self.api(self.agent).post("/api/consultation/consult/", {"x": 369200, "y": 371665, "zone": "nord", "radius": 500}, format="json").json()
        self.assertEqual([n["projet_id"] for n in r["neighbours"]], ["PRJ-C-2"])
        self.api(self.office).post("/api/consultation/consult/", {"x": 369200, "y": 371665, "zone": "nord"}, format="json")
        self.assertEqual(len(self.api(self.agent).get("/api/consultation/history/").json()["results"]), 1)
        hist = self.api(self.office).get("/api/consultation/history/").json()
        self.assertEqual({h["username"] for h in hist["results"]}, {"agent", "dispatch"})

    def test_history_search_and_csv(self):
        self.api(self.office).post("/api/consultation/consult/", {"x": 369200, "y": 371665, "label": "Visite Hay Riad"}, format="json")
        c = self.api(self.office)
        self.assertEqual(len(c.get("/api/consultation/history/?q=riad").json()["results"]), 1)
        csv = c.get("/api/consultation/history/csv/")
        self.assertIn("Visite Hay Riad", csv.content.decode("utf-8-sig"))

    def test_file_consultation_with_ancfcc_text(self):
        r = self.api(self.office).post("/api/consultation/consult/file/", {"text": ANCFCC, "zone": "nord", "radius": 200}, format="multipart").json()
        (item,) = r["parcels"]
        self.assertEqual(item["parcel"]["titre"], "T98525/03")
        self.assertEqual(item["result"]["alerts"][0]["kind"], "same_titre")
        self.assertEqual(Consultation.objects.filter(kind="parcelle").count(), 1)

    def test_file_upload_error_is_reported(self):
        r = self.api(self.office).post("/api/consultation/consult/file/", {"text": "rien"}, format="multipart")
        self.assertEqual(r.status_code, 400)


class OutputsTests(ApiTestCase):
    def test_report_pdf(self):
        r = self.api(self.office).post("/api/consultation/report/", {"x": 369040, "y": 371665, "radius": 300, "label": "Test"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b"%PDF"))

    def test_batch_workbook(self):
        csv = b"borne;x;y\nA;369040;371665\nB;375000;380000\n"
        from django.core.files.uploadedfile import SimpleUploadedFile

        r = self.api(self.office).post("/api/consultation/batch/", {"file": SimpleUploadedFile("l.csv", csv), "radius": 200}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        wb = load_workbook(io.BytesIO(r.content))
        self.assertEqual(wb.sheetnames, ["Parcelles", "Résultats", "Paramètres"])
        rows = list(wb["Parcelles"].iter_rows(min_row=2, values_only=True))
        self.assertEqual([x[8] for x in rows], ["Déjà livré", "OK"])

    def test_near_me_and_route(self):
        lat, lng = lambert_to_wgs84(369130, 371665, "nord")
        c = self.api(self.office)
        near = c.post("/api/consultation/near/", {"lat": lat, "lng": lng, "radius": 1000}, format="json").json()
        self.assertEqual([n["projet_id"] for n in near["results"]], ["PRJ-C-2", "PRJ-C-1"])
        open_only = c.post("/api/consultation/near/", {"lat": lat, "lng": lng, "radius": 1000, "only_open": True}, format="json").json()
        self.assertEqual([n["projet_id"] for n in open_only["results"]], ["PRJ-C-2"])
        route = c.post("/api/consultation/route/", {"start": {"lat": lat, "lng": lng}, "projet_ids": ["PRJ-C-3", "PRJ-C-1", "PRJ-C-2"]}, format="json").json()
        self.assertEqual([s["projet_id"] for s in route["stops"]][-1], "PRJ-C-3")
        self.assertGreater(route["total_minutes"], 0)


class NotificationTests(ApiTestCase):
    def test_new_projet_near_an_existing_one_notifies_once(self):
        lat, lng = lambert_to_wgs84(369200, 371665, "nord")
        p = Projet.objects.create(id="PRJ-C-9", client=self.client_, reference_fonciere="T9/03", lat=lat, lng=lng)
        created = notifications.evaluate_projet(p.id)
        self.assertTrue(created)
        self.assertIn("T55555/03", created[0].message)
        self.assertEqual(notifications.evaluate_projet(p.id), [])
        data = self.api(self.office).get("/api/consultation/notifications/").json()
        self.assertEqual(data["unread"], len(data["results"]))
        self.api(self.office).post("/api/consultation/notifications/read/", {}, format="json")
        self.assertEqual(self.api(self.office).get("/api/consultation/notifications/").json()["unread"], 0)

    def test_overlap_with_delivered_survey_is_danger(self):
        lat, lng = lambert_to_wgs84(369040, 371665, "nord")
        p = Projet.objects.create(id="PRJ-C-8", client=self.client_, lat=lat, lng=lng)
        created = notifications.evaluate_projet(p.id)
        self.assertEqual(created[0].severity, "danger")

    def test_save_signal_runs_after_commit(self):
        lat, lng = lambert_to_wgs84(369200, 371665, "nord")
        with self.captureOnCommitCallbacks(execute=True):
            Projet.objects.create(id="PRJ-C-7", client=self.client_, lat=lat, lng=lng)
        self.assertTrue(ProximityNotification.objects.filter(projet_id="PRJ-C-7").exists())
        self.assertTrue(SeenProjet.objects.filter(projet_id="PRJ-C-7").exists())

    def test_existing_projets_are_seeded_as_seen_by_the_migration_only_not_by_tests(self):
        # a projet without location is never marked seen, so it can notify once it gets one
        p = Projet.objects.create(id="PRJ-C-6", client=self.client_)
        self.assertEqual(notifications.evaluate_projet(p.id), [])
        self.assertFalse(SeenProjet.objects.filter(projet_id="PRJ-C-6").exists())


class LayerTests(ApiTestCase):
    def test_import_layer_and_see_it_in_consultations(self):
        c = self.api(self.office)
        r = c.post("/api/consultation/layers/", {"text": ANCFCC, "name": "Voisins T98525", "zone": "nord"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["count"], 1)
        geo = c.get("/api/consultation/layers/geojson/").json()
        self.assertEqual(len(geo["features"]), 1)
        res = c.post("/api/consultation/consult/", {"x": 369030, "y": 371650, "radius": 100}, format="json").json()
        self.assertEqual(res["reference"][0]["titre"], "T98525/03")
        self.assertEqual(c.delete(f"/api/consultation/layers/{r.json()['id']}/").status_code, 204)

    def test_agents_cannot_import_layers(self):
        r = self.api(self.agent).post("/api/consultation/layers/", {"text": ANCFCC}, format="multipart")
        self.assertEqual(r.status_code, 403)
