from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from clients.models import Client
from employees.models import Employee
from projets.models import Prestation, Projet

from .mentions import find_mentioned
from .models import Comment


class CommentTests(TestCase):
    """Comments on a prestation: creation through /api/comments/, the per-viewer is_read flag,
    the readers list, and how they surface on the prestation itself."""

    @classmethod
    def setUpTestData(cls):
        cls.author = User.objects.create_user("dispatcher", password="x")
        Employee.objects.create(id="EMP-001", user=cls.author, nom="Salma Idrissi", role="Dispatcher")
        # No Employee row: the display name falls back to the user's first name.
        cls.reader = User.objects.create_user("bureau", password="x", first_name="Karim")
        client = Client.objects.create(id="CLI-0001", nom="SOMADIR")
        projet = Projet.objects.create(id="PRJ-2026-001", client=client)
        cls.prestation = Prestation.objects.create(id="PRS-2026-001", projet=projet)

    def setUp(self):
        self.api = APIClient(SERVER_NAME="localhost")
        self.api.force_authenticate(self.author)

    def post_comment(self, text="Plan reçu, merci @Karim"):
        return self.api.post(
            "/api/comments/",
            {"content_type_model_input": "prestation", "object_id": self.prestation.pk, "text": text},
            format="json",
        )

    def as_user(self, user):
        self.api.force_authenticate(user)

    def test_create_sets_author_and_attaches_to_prestation(self):
        response = self.post_comment()

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["author"], "Salma Idrissi")
        self.assertFalse(response.data["is_read"])
        self.assertEqual(response.data["readers"], [])
        comment = Comment.objects.get(pk=response.data["id"])
        self.assertEqual(comment.created_by, self.author)
        self.assertEqual(comment.content_object, self.prestation)

    def test_create_rejects_unknown_model(self):
        response = self.api.post(
            "/api/comments/",
            {"content_type_model_input": "client", "object_id": "CLI-0001", "text": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Comment.objects.count(), 0)

    def test_anonymous_cannot_create(self):
        self.api.force_authenticate(None)
        response = self.post_comment()
        self.assertEqual(response.status_code, 401)
        self.assertEqual(Comment.objects.count(), 0)

    def test_mark_read_is_per_viewer(self):
        comment_id = self.post_comment().data["id"]

        self.as_user(self.reader)
        response = self.api.post(f"/api/comments/{comment_id}/mark_read/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.data["is_read"])
        self.assertEqual(response.data["readers"], ["Karim"])

        # Read by Karim, not by its author.
        self.as_user(self.author)
        detail = self.api.get(f"/api/comments/{comment_id}/").data
        self.assertFalse(detail["is_read"])
        self.assertEqual(detail["readers"], ["Karim"])

    def test_mark_read_twice_keeps_one_reader(self):
        comment_id = self.post_comment().data["id"]
        self.as_user(self.reader)
        self.api.post(f"/api/comments/{comment_id}/mark_read/")
        response = self.api.post(f"/api/comments/{comment_id}/mark_read/")

        self.assertEqual(response.data["readers"], ["Karim"])
        self.assertEqual(Comment.objects.get(pk=comment_id).read_by.count(), 1)

    def test_prestation_serializes_its_comments_in_order(self):
        self.post_comment("premier")
        self.post_comment("second")

        response = self.api.get(f"/api/prestations/{self.prestation.pk}/")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([c["text"] for c in response.data["comments"]], ["premier", "second"])


class FindMentionedTests(SimpleTestCase):
    def _employees(self, *noms):
        return [Employee(id=f"EMP-{i}", nom=nom) for i, nom in enumerate(noms)]

    def _names(self, text, *noms):
        return sorted(e.nom for e in find_mentioned(text, self._employees(*noms)))

    def test_finds_every_named_employee(self):
        self.assertEqual(self._names("@Salma Idrissi et @Karim Alami, voir plan", "Salma Idrissi", "Karim Alami", "Paul"), ["Karim Alami", "Salma Idrissi"])

    def test_longest_name_wins(self):
        self.assertEqual(self._names("merci @Salma Idrissi", "Salma", "Salma Idrissi"), ["Salma Idrissi"])

    def test_shorter_name_still_found_elsewhere(self):
        self.assertEqual(self._names("@Salma Idrissi et @Salma", "Salma", "Salma Idrissi"), ["Salma", "Salma Idrissi"])

    def test_name_must_not_run_on(self):
        self.assertEqual(self._names("@Salmane", "Salma"), [])
        self.assertEqual(self._names("@Salma, merci", "Salma"), ["Salma"])

    def test_no_at_sign_no_mention(self):
        self.assertEqual(self._names("Salma Idrissi a validé", "Salma Idrissi"), [])


class CommentMentionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("dispatcher", password="x")
        cls.salma = Employee.objects.create(id="EMP-001", user=cls.user, nom="Salma Idrissi", role="Dispatcher")
        cls.karim = Employee.objects.create(id="EMP-002", nom="Karim Alami", role="Agent Bureau")
        client = Client.objects.create(id="CLI-0001", nom="SOMADIR")
        projet = Projet.objects.create(id="PRJ-2026-001", client=client)
        cls.prestation = Prestation.objects.create(id="PRS-2026-001", projet=projet)

    def setUp(self):
        self.api = APIClient(SERVER_NAME="localhost")
        self.api.force_authenticate(self.user)

    def test_mentions_are_stored_and_follow_a_rename(self):
        response = self.api.post(
            "/api/comments/",
            {"content_type_model_input": "prestation", "object_id": self.prestation.pk, "text": "@Karim Alami peux-tu vérifier ?"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["mentions"], [{"id": "EMP-002", "nom": "Karim Alami"}])

        self.karim.nom = "Karim El Alami"
        self.karim.save()
        detail = self.api.get(f"/api/comments/{response.data['id']}/").data
        self.assertEqual(detail["mentions"], [{"id": "EMP-002", "nom": "Karim El Alami"}])

    def test_editing_the_text_re_resolves_mentions(self):
        comment_id = self.api.post(
            "/api/comments/",
            {"content_type_model_input": "prestation", "object_id": self.prestation.pk, "text": "@Karim Alami"},
            format="json",
        ).data["id"]
        response = self.api.patch(f"/api/comments/{comment_id}/", {"text": "@Salma Idrissi finalement"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([m["nom"] for m in response.data["mentions"]], ["Salma Idrissi"])
