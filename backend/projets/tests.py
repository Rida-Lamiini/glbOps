import datetime
import tempfile

import fitz
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from clients.models import Client
from employees.models import Employee
from resources.models import Resource

from .models import HistoryEntry, Prestation, Projet, Tache

LOT_BODY = {
    "titre_foncier": "TF/52310-C",
    "propriete_dite": "Dar Salam",
    "surface_document_m2": 5000,
    "correction_lambert_m2": 0,
    "bornes": [
        {"name": "B1", "sequence": 1, "x_lambert": 500000.0, "y_lambert": 300000.0},
        {"name": "B2", "sequence": 2, "x_lambert": 500100.0, "y_lambert": 300000.0},
        {"name": "B3", "sequence": 3, "x_lambert": 500100.0, "y_lambert": 300050.0},
        {"name": "B4", "sequence": 4, "x_lambert": 500000.0, "y_lambert": 300050.0},
    ],
}


def _png(width=1600, height=1200):
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, width, height), False)
    pix.set_rect(pix.irect, (120, 160, 90))
    return pix.tobytes("png")


def _pdf_text(data):
    with fitz.open(stream=data, filetype="pdf") as doc:
        return doc.page_count, "\n".join(page.get_text() for page in doc)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PvPdfTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("dispatcher", password="x")
        Employee.objects.create(id="EMP-001", user=cls.user, nom="Salma Idrissi", role="Dispatcher")
        chantier = Employee.objects.create(id="EMP-002", nom="Youssef Benali", role="Agent Chantier")
        bureau = Employee.objects.create(id="EMP-003", nom="Karim Alami", role="Agent Bureau")
        controle = Employee.objects.create(id="EMP-004", nom="Nadia Tazi", role="Agent Contrôle")
        client = Client.objects.create(id="CLI-0231", nom="SOMADIR Immobilier", contact="M. Berrada")
        cls.projet = Projet.objects.create(
            id="PRJ-2026-001", client=client, situation="Témara", reference_fonciere="TF/52310-C",
            nature_prestation_projet="Levé topographique", lat=33.92, lng=-6.91,
        )
        cls.prestation = Prestation.objects.create(
            id="PRS-2026-001", projet=cls.projet, nature_demandee="Levé topographique",
            nature_executee="Levé + plan côté", stage="livraison", ref="LIV-042", chemin=r"\\SERVEUR\livraisons\042",
            date_livraison=datetime.date(2026, 9, 20), cycles=1, date_debut_exec="14/09/2026 08:30",
            agent_bureau=bureau, agent_controle=controle, cd_n="CD-7",
        )
        cls.prestation.agent_chantier.add(chantier)
        cls.prestation.materiels.add(Resource.objects.create(id="MAT-001", nom="Leica TS16", type="station_totale"))
        tache = Tache.objects.create(prestation=cls.prestation, label="Plan côté", done=True)
        tache.agents.add(bureau)
        HistoryEntry.objects.create(prestation=cls.prestation, date="16/09/2026", label="Non conforme — bornes B3/B4 inversées", author="Nadia Tazi")

    def setUp(self):
        self.api = APIClient(SERVER_NAME="localhost")
        self.api.force_authenticate(self.user)

    def test_full_pv(self):
        r = self.api.post("/api/cadastre/lots/", {**LOT_BODY, "projet": self.projet.id, "prestation": self.prestation.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        photo = SimpleUploadedFile("facade.png", _png(), content_type="image/png")
        r = self.api.post(
            "/api/attachments/",
            {"content_type_model_input": "prestation", "object_id": self.prestation.id, "type": "photo", "label": "Façade nord", "file": photo},
            format="multipart",
        )
        self.assertEqual(r.status_code, 201, r.content)

        response = self.api.get(f"/api/prestations/{self.prestation.id}/pv/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn('filename="PV-PRS-2026-001.pdf"', response["Content-Disposition"])
        pages, text = _pdf_text(response.content)
        self.assertGreaterEqual(pages, 1)
        for expected in [
            "Procès-verbal — Levé topographique", "PV N° PRS-2026-001", "Prestation livrée",
            "SOMADIR Immobilier (CLI-0231)", "LAMBERT NORD MAROC (EPSG:26191)", "Youssef Benali", "Leica TS16",
            "Lot cadastral", "Titre foncier TF/52310-C", "5 000,00 m²", "conforme (≤ 1 m²)", "Dar Salam",
            "Photos de terrain", "Façade nord", "Plan côté (Karim Alami)", "Historique des reprises",
            "bornes B3/B4 inversées", "Nadia Tazi", "Conforme après 1 reprise", "20/09/2026", "CD-7",
            "Client (lu et approuvé)", "M. Berrada", f"Page 1 / {pages}",
        ]:
            self.assertIn(expected, text)
        # The 1600 px photo is downscaled, so the PDF stays small.
        self.assertLess(len(response.content), 400_000)

    def test_pv_in_progress_leaves_out_later_sections(self):
        self.prestation.stage = "execution"
        self.prestation.save()
        HistoryEntry.objects.all().delete()

        _, text = _pdf_text(self.api.get(f"/api/prestations/{self.prestation.id}/pv/").content)

        self.assertIn("Étape en cours : Exécution", text)
        for absent in ("Traitement bureau", "Contrôle", "Livraison", "Lot cadastral", "Photos de terrain", "Historique des reprises"):
            self.assertNotIn(absent, text)

    def test_pv_requires_login(self):
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get(f"/api/prestations/{self.prestation.id}/pv/").status_code, 401)


class MonthlyReportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from employees.models import Conge

        cls.office = User.objects.create_user("directrice", password="x")
        Employee.objects.create(id="EMP-001", user=cls.office, nom="Salma Idrissi", role="Directrice")
        cls.agent = User.objects.create_user("chantier", password="x")
        youssef = Employee.objects.create(id="EMP-002", user=cls.agent, nom="Youssef Benali", role="Agent Chantier", poste="Topographe")
        client = Client.objects.create(id="CLI-0231", nom="SOMADIR Immobilier")
        projet = Projet.objects.create(id="PRJ-2026-001", client=client)
        livree = Prestation.objects.create(
            id="PRS-2026-001", projet=projet, nature_demandee="Levé topographique", stage="livraison", chemin="x",
            date_debut_demande=datetime.date(2026, 9, 2), date_livraison=datetime.date(2026, 9, 20), cycles=1,
        )
        HistoryEntry.objects.create(prestation=livree, date="16/09/2026", label="Non conforme — bornes inversées", author="Nadia Tazi")
        en_cours = Prestation.objects.create(id="PRS-2026-002", projet=projet, stage="execution", date_debut_demande=datetime.date(2026, 9, 10))
        en_cours.agent_chantier.add(youssef)
        Prestation.objects.create(id="PRS-2026-003", projet=projet, stage="demande", date_debut_demande=datetime.date(2026, 8, 5))
        Resource.objects.create(id="VEH-001", nom="Duster 12345-A-6", type="vehicule", assurance_echeance=datetime.date(2020, 1, 1))
        Resource.objects.create(id="MAT-001", nom="Leica TS16", type="station_totale", prochaine_calibration=datetime.date(2020, 1, 1))
        Conge.objects.create(id="CNG-1", employee=youssef, type="Congé payé", date_debut=datetime.date(2026, 9, 25), date_fin=datetime.date(2026, 10, 2), statut="approuve")

    def _get(self, user, query="?month=2026-09"):
        api = APIClient(SERVER_NAME="localhost")
        api.force_authenticate(user)
        return api.get(f"/api/reports/monthly/{query}")

    def test_monthly_report(self):
        response = self._get(self.office)

        self.assertEqual(response.status_code, 200)
        self.assertIn('filename="Rapport-direction-2026-09.pdf"', response["Content-Disposition"])
        _, text = _pdf_text(response.content)
        for expected in [
            "Rapport de direction — Septembre 2026", "DEMANDES REÇUES", "+1 vs mois précédent", "18 j",
            "Points d'attention", "1 véhicule avec un papier expiré (Duster 12345-A-6)", "PRS-2026-001", "SOMADIR Immobilier",
            "Non conforme — bornes inversées", "Duster 12345-A-6", "Assurance", "expiré — échéance 01/01/2020",
            "Leica TS16", "en retard (échéance 01/01/2020)", "Youssef Benali", "Topographe",
            "Congé payé, du 25/09/2026 au 02/10/2026 (approuvé)", "LOTS ENREGISTRÉS", "Établi par Salma Idrissi",
            "sept", "août",
        ]:
            self.assertIn(expected, text)

    def test_agents_are_refused_and_month_is_checked(self):
        self.assertEqual(self._get(self.agent).status_code, 403)
        self.assertEqual(self._get(self.office, "?month=2026-13").status_code, 400)
        self.assertEqual(self._get(self.office, "?month=sept").status_code, 400)
        self.assertEqual(self._get(self.office, "").status_code, 200)
