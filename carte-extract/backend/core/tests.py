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
        res = self.api_as(self.agent_user).patch("/api/prestations/PRS-2026-001/", {"nature_executee": "Bornage"}, format="json")
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


class ConcurrencyTests(TestCase):
    """Two people editing the same lot or projet: the second save is refused, not silently merged."""

    @classmethod
    def setUpTestData(cls):
        from clients.models import Client
        from projets.models import Projet

        cls.office = User.objects.create_user("office", password="x")  # no Employee row counts as office
        client = Client.objects.create(id="CLI-C1", nom="Client")
        cls.projet = Projet.objects.create(id="PRJ-C-1", client=client, situation="Marrakech")

    def _api(self):
        from rest_framework.test import APIClient

        api = APIClient(SERVER_NAME="localhost")
        api.force_authenticate(self.office)
        return api

    def test_projet_stale_version_is_refused(self):
        api = self._api()
        url = f"/api/projets/{self.projet.id}/"
        loaded = api.get(url).json()["version"]
        first = api.patch(url, {"situation": "Agadir"}, format="json", headers={"X-Expected-Version": str(loaded)})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["version"], loaded + 1)
        stale = api.patch(url, {"situation": "Fès"}, format="json", headers={"X-Expected-Version": str(loaded)})
        self.assertEqual(stale.status_code, 409)
        self.assertIn("modifié par quelqu'un d'autre", stale.json()["detail"])
        self.projet.refresh_from_db()
        self.assertEqual(self.projet.situation, "Agadir")  # the stale save changed nothing
        fresh = api.patch(url, {"situation": "Fès"}, format="json", headers={"X-Expected-Version": str(loaded + 1)})
        self.assertEqual(fresh.status_code, 200)

    def test_requests_without_the_header_are_not_checked(self):
        api = self._api()
        url = f"/api/projets/{self.projet.id}/"
        self.assertEqual(api.patch(url, {"notes": "a"}, format="json").status_code, 200)
        self.assertEqual(api.patch(url, {"notes": "b"}, format="json").status_code, 200)

    def test_lot_stale_version_is_refused(self):
        from cadastre.tests import _payload

        api = self._api()
        body = _payload(self.projet.id, "TF/C/1")
        lot_id = api.post("/api/cadastre/lots/", body, format="json").json()["id"]
        url = f"/api/cadastre/lots/{lot_id}/"
        v = api.get(url).json()["version"]
        ok = api.put(url, body, format="json", headers={"X-Expected-Version": str(v)})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["version"], v + 1)
        stale = api.put(url, {**body, "propriete_dite": "Autre"}, format="json", headers={"X-Expected-Version": str(v)})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(api.get(url).json()["propriete_dite"], "Terrain test")


class BackupTests(SimpleTestCase):
    """The local backup/restore cycle on a real SQLite file (independent of the test database)."""

    def setUp(self):
        import sqlite3
        import tempfile
        from pathlib import Path

        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)
        con = sqlite3.connect(self.dir / "carte.sqlite3")
        con.execute("create table t (v text)")
        con.execute("insert into t values ('avant')")
        con.commit()
        con.close()
        (self.dir / "media" / "attachments").mkdir(parents=True)
        (self.dir / "media" / "attachments" / "plan.pdf").write_bytes(b"PDF-1")

    def _value(self):
        import sqlite3

        con = sqlite3.connect(self.dir / "carte.sqlite3")
        try:
            return con.execute("select v from t").fetchone()[0]
        finally:
            con.close()

    def test_backup_then_restore_brings_back_data_and_files(self):
        import sqlite3

        from . import backups

        made = backups.create_backup(self.dir, version="9.9.9")
        self.assertIn(made["name"], [b["name"] for b in backups.list_backups(self.dir)])
        con = sqlite3.connect(self.dir / "carte.sqlite3")
        con.execute("update t set v = 'apres'")
        con.commit()
        con.close()
        (self.dir / "media" / "attachments" / "plan.pdf").write_bytes(b"PDF-2")
        (self.dir / "media" / "attachments" / "new.pdf").write_bytes(b"X")

        backups.stage_restore(self.dir, made["name"])
        self.assertEqual(self._value(), "apres")  # nothing changes until the restart
        self.assertTrue(backups.apply_pending_restore(self.dir))
        self.assertEqual(self._value(), "avant")
        self.assertEqual((self.dir / "media" / "attachments" / "plan.pdf").read_bytes(), b"PDF-1")
        self.assertFalse((self.dir / "media" / "attachments" / "new.pdf").exists())
        self.assertFalse(backups.apply_pending_restore(self.dir))  # one-shot
        # the state before the restore was kept as a safety copy
        self.assertTrue(any("avant-restauration" in b["name"] for b in backups.list_backups(self.dir)))

    def test_maybe_backup_only_when_due_and_prune_keeps_the_newest(self):
        from . import backups

        self.assertIsNotNone(backups.maybe_backup(self.dir, every_hours=24))
        self.assertIsNone(backups.maybe_backup(self.dir, every_hours=24))
        import time

        for _ in range(3):
            time.sleep(1.1)  # names carry the second
            backups.create_backup(self.dir, keep=2)
        autos = [b for b in backups.list_backups(self.dir) if "avant-restauration" not in b["name"]]
        self.assertEqual(len(autos), 2)

    def test_bad_names_are_refused(self):
        from . import backups

        for name in ("../x.zip", "a/b.zip", "nope.txt", ""):
            with self.assertRaises(backups.BackupError):
                backups.stage_restore(self.dir, name)


class UpdateCheckTests(SimpleTestCase):
    """The in-app update check: version comparison, manifest validation, integrity check."""

    def test_version_comparison(self):
        from .updates import is_newer, parse_version

        self.assertEqual(parse_version("v1.2.3"), (1, 2, 3, 0))
        self.assertTrue(is_newer("1.10.0", "1.9.9"))
        self.assertTrue(is_newer("2.0", "1.99.99"))
        self.assertFalse(is_newer("1.0.0", "1.0.0"))
        self.assertFalse(is_newer("0.9.0", "1.0.0"))

    def _check(self, manifest, url="https://example.org/latest.json", current="1.0.0"):
        from unittest import mock

        from . import updates

        updates._cache.update(at=0.0, value=None)

        class Resp:
            def json(self_inner):
                return manifest

        with mock.patch.dict("os.environ", {"CARTE_UPDATE_URL": url}), \
                mock.patch("core.updates.requests.get", return_value=Resp()), \
                mock.patch("core.updates.app_version", return_value=current):
            return updates.check(force=True)

    def test_newer_version_is_offered(self):
        r = self._check({"version": "1.1.0", "url": "https://example.org/Setup.exe", "sha256": "ab", "notes": "Nouveautés"})
        self.assertTrue(r["available"])
        self.assertEqual((r["latest"], r["notes"]), ("1.1.0", "Nouveautés"))

    def test_same_or_older_version_is_not_offered(self):
        self.assertFalse(self._check({"version": "1.0.0", "url": "https://example.org/S.exe", "sha256": "ab"})["available"])

    def test_insecure_or_incomplete_manifests_are_refused(self):
        # plain http installer, missing checksum, plain http manifest address
        self.assertFalse(self._check({"version": "9.0.0", "url": "http://evil.example/S.exe", "sha256": "ab"})["available"])
        self.assertFalse(self._check({"version": "9.0.0", "url": "https://example.org/S.exe"})["available"])
        r = self._check({"version": "9.0.0", "url": "https://example.org/S.exe", "sha256": "ab"}, url="http://example.org/latest.json")
        self.assertFalse(r["available"])
        self.assertTrue(r["error"])

    def test_no_address_means_no_check(self):
        from unittest import mock

        from . import updates

        with mock.patch.dict("os.environ", {"CARTE_UPDATE_URL": ""}), mock.patch("core.updates.update_url", return_value=""):
            r = updates.check(force=True)
        self.assertEqual((r["configured"], r["available"]), (False, False))

    def test_a_tampered_download_is_refused(self):
        from unittest import mock

        from . import updates

        class Resp:
            headers = {"Content-Length": "5"}

            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a):
                return False

            def raise_for_status(self_inner):
                pass

            def iter_content(self_inner, n):
                return iter([b"hello"])

        with mock.patch("core.updates.requests.get", return_value=Resp()), mock.patch("core.updates.subprocess.Popen") as popen:
            updates._run_install({"url": "https://example.org/S.exe", "sha256": "0" * 64, "size": 5})
        self.assertEqual(updates.status()["state"], "error")
        self.assertIn("corrompu", updates.status()["error"])
        popen.assert_not_called()  # nothing is ever run when the checksum differs
