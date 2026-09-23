from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from projets.models import Projet

from .models import Client


class ClientRenameTests(TestCase):
    """Client.id is the office's "code interne" and a real FK target, so ClientViewSet.update
    renames it with a queryset UPDATE and only while nothing references the old id."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("tester", password="x")

    def setUp(self):
        self.api = APIClient(SERVER_NAME="localhost")
        self.api.force_authenticate(self.user)
        self.client_obj = Client.objects.create(id="CLI-0001", nom="SOMADIR")

    def rename(self, new_id, **extra):
        return self.api.patch(f"/api/clients/{self.client_obj.pk}/", {"id": new_id, **extra}, format="json")

    def test_rename_moves_the_row_to_the_new_id(self):
        response = self.rename("ACME-42", nom="SOMADIR Immobilier")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["id"], "ACME-42")
        self.assertEqual(response.data["nom"], "SOMADIR Immobilier")
        # A real rename, not a second row left next to the old one.
        self.assertFalse(Client.objects.filter(pk="CLI-0001").exists())
        self.assertEqual(Client.objects.get(pk="ACME-42").nom, "SOMADIR Immobilier")
        self.assertEqual(Client.objects.count(), 1)

    def test_rename_refused_when_client_has_projets(self):
        Projet.objects.create(id="PRJ-2026-001", client=self.client_obj)

        response = self.rename("ACME-42")

        self.assertEqual(response.status_code, 400)
        self.assertIn("id", response.data)
        self.assertTrue(Client.objects.filter(pk="CLI-0001").exists())
        self.assertFalse(Client.objects.filter(pk="ACME-42").exists())
        self.assertEqual(Projet.objects.get(pk="PRJ-2026-001").client_id, "CLI-0001")

    def test_rename_refused_when_new_id_is_taken(self):
        Client.objects.create(id="CLI-0002", nom="Autre client")

        response = self.rename("CLI-0002")

        self.assertEqual(response.status_code, 400)
        self.assertIn("id", response.data)
        self.assertEqual(Client.objects.get(pk="CLI-0001").nom, "SOMADIR")
        self.assertEqual(Client.objects.get(pk="CLI-0002").nom, "Autre client")
