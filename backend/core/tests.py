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


class ProfileTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from employees.models import Employee

        cls.user = User.objects.create_user("agent", password="Ancien-mdp-2026!")
        cls.employee = Employee.objects.create(
            id="EMP-P1", nom="Sara Test", role="Agent Chantier", poste="Topographe", user=cls.user,
        )

    def _api(self):
        api = APIClient(SERVER_NAME="localhost")
        api.force_authenticate(self.user)
        return api

    def test_profile_carries_the_employee_details(self):
        d = self._api().get("/api/auth/me/").json()
        self.assertEqual((d["name"], d["role"], d["poste"], d["username"]), ("Sara Test", "Agent Chantier", "Topographe", "agent"))

    def test_patch_updates_only_contact_details(self):
        r = self._api().patch("/api/auth/me/", {"email": "sara@example.com", "telephone": "0600000000", "role": "Dispatcher"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.employee.refresh_from_db()
        self.assertEqual((self.employee.email, self.employee.telephone, self.employee.role), ("sara@example.com", "0600000000", "Agent Chantier"))
        self.assertEqual(self._api().patch("/api/auth/me/", {"email": "pas-un-mail"}, format="json").status_code, 400)

    def test_change_password(self):
        api = self._api()
        self.assertEqual(api.post("/api/auth/change-password/", {"current_password": "faux", "new_password": "Nouveau-mdp-2026!"}, format="json").status_code, 400)
        self.assertEqual(api.post("/api/auth/change-password/", {"current_password": "Ancien-mdp-2026!", "new_password": "123"}, format="json").status_code, 400)
        self.assertEqual(api.post("/api/auth/change-password/", {"current_password": "Ancien-mdp-2026!", "new_password": "Nouveau-mdp-2026!"}, format="json").status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Nouveau-mdp-2026!"))


class AnonymousAccessTests(TestCase):
    """Nothing but the login endpoints is reachable without a token: reads used to be open."""

    ENDPOINTS = [
        "/api/projets/",
        "/api/prestations/",
        "/api/clients/",
        "/api/employees/",
        "/api/resources/",
        "/api/comments/",
        "/api/attachments/",
    ]

    def test_reads_require_authentication(self):
        api = APIClient(SERVER_NAME="localhost")
        for url in self.ENDPOINTS:
            with self.subTest(url=url):
                self.assertEqual(api.get(url).status_code, 401)

    def test_health_stays_public(self):
        # The container healthcheck calls it without a token.
        self.assertEqual(APIClient(SERVER_NAME="localhost").get("/api/health/").status_code, 200)

    def test_login_stays_public(self):
        User.objects.create_user("someone", password="pw12345!")
        api = APIClient(SERVER_NAME="localhost")
        res = api.post("/api/auth/token/", {"username": "someone", "password": "pw12345!"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)


class RolePermissionTests(TestCase):
    """Server-side role rules that used to exist only in the UI (frontend/src/utils/access.js)."""

    @classmethod
    def setUpTestData(cls):
        cls.office_user = User.objects.create_user("dispatcher", password="x")
        cls.office = Employee.objects.create(id="EMP-001", user=cls.office_user, nom="Salma Idrissi", role="Dispatcher")
        cls.agent_user = User.objects.create_user("chantier", password="x")
        cls.agent = Employee.objects.create(id="EMP-002", user=cls.agent_user, nom="Karim", role="Agent Chantier")
        cls.other_user = User.objects.create_user("bureau", password="x")
        Employee.objects.create(id="EMP-003", user=cls.other_user, nom="Nadia", role="Agent Bureau")
        cls.client_obj = Client.objects.create(id="CLI-0001", nom="SOMADIR")
        cls.projet = Projet.objects.create(id="PRJ-2026-001", client=cls.client_obj)
        cls.prestation = Prestation.objects.create(id="PRS-2026-001", projet=cls.projet)

    def api_as(self, user):
        api = APIClient(SERVER_NAME="localhost")
        api.force_authenticate(user)
        return api

    def test_agent_can_read_but_not_write_office_resources(self):
        api = self.api_as(self.agent_user)
        for url in ("/api/clients/", "/api/employees/", "/api/resources/", "/api/conges/"):
            self.assertEqual(api.get(url).status_code, 200, url)
        self.assertEqual(api.post("/api/clients/", {"id": "CLI-0002", "nom": "X"}, format="json").status_code, 403)
        self.assertEqual(api.patch("/api/clients/CLI-0001/", {"nom": "Y"}, format="json").status_code, 403)
        self.assertEqual(api.delete("/api/clients/CLI-0001/").status_code, 403)
        self.assertEqual(api.post("/api/resources/", {"id": "MAT-1", "nom": "GPS", "type": "materiel"}, format="json").status_code, 403)

    def test_agent_cannot_promote_themselves(self):
        res = self.api_as(self.agent_user).patch("/api/employees/EMP-002/", {"role": "Directrice"}, format="json")
        self.assertEqual(res.status_code, 403)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.role, "Agent Chantier")

    def test_office_can_edit_employees_and_clients(self):
        api = self.api_as(self.office_user)
        self.assertEqual(api.patch("/api/employees/EMP-002/", {"poste": "Topographe"}, format="json").status_code, 200)
        self.assertEqual(api.patch("/api/clients/CLI-0001/", {"nom": "SOMADIR SA"}, format="json").status_code, 200)

    def test_only_office_creates_and_deletes_projets(self):
        agent = self.api_as(self.agent_user)
        self.assertEqual(agent.post("/api/projets/", {"id": "PRJ-2026-002", "client": "CLI-0001"}, format="json").status_code, 403)
        self.assertEqual(agent.delete("/api/projets/PRJ-2026-001/").status_code, 403)
        self.assertEqual(agent.delete("/api/prestations/PRS-2026-001/").status_code, 403)
        office = self.api_as(self.office_user)
        self.assertEqual(office.post("/api/projets/", {"id": "PRJ-2026-002", "client": "CLI-0001"}, format="json").status_code, 201)

    def test_agent_can_still_edit_a_prestation(self):
        res = self.api_as(self.agent_user).patch("/api/prestations/PRS-2026-001/", {"stage": "affectation"}, format="json")
        self.assertEqual(res.status_code, 200)

    def test_comment_only_its_author_edits_and_office_deletes(self):
        res = self.api_as(self.agent_user).post(
            "/api/comments/",
            {"content_type_model_input": "prestation", "object_id": self.prestation.pk, "text": "Vu"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        url = f"/api/comments/{res.data['id']}/"
        stranger = self.api_as(self.other_user)
        self.assertEqual(stranger.patch(url, {"text": "Modifié"}, format="json").status_code, 403)
        self.assertEqual(stranger.delete(url).status_code, 403)
        # Reading and marking as read stay open to everyone.
        self.assertEqual(stranger.post(f"{url}mark_read/", {}, format="json").status_code, 200)
        self.assertEqual(self.api_as(self.agent_user).patch(url, {"text": "Vu, ok"}, format="json").status_code, 200)
        self.assertEqual(self.api_as(self.office_user).delete(url).status_code, 204)
