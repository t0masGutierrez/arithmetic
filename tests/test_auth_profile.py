import tempfile
import unittest
from pathlib import Path

from arithmetic import DEFAULT_CONFIG
from webapp.app import create_app, summarize_settings


class AuthProfileTests(unittest.TestCase):
    DEFAULT_PASSWORD = "super-secret-password"

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "test.db"
        self.app = create_app(
            {
                "TESTING": True,
                "SECRET_KEY": "test-secret",
                "DATABASE_PATH": str(self.db_path),
            }
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.tmpdir.cleanup()

    def register_and_login(self, email="alice@example.com", password=DEFAULT_PASSWORD, username="alice"):
        response = self.client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "username": username},
        )
        self.assertEqual(response.status_code, 201)
        return response.get_json()["user"]

    def login(self, email, password=DEFAULT_PASSWORD):
        return self.client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )

    def default_settings(self, **overrides):
        settings = dict(DEFAULT_CONFIG)
        settings.update(overrides)
        return settings

    def test_auth_providers_endpoint_lists_email_google_and_github(self):
        response = self.client.get("/api/auth/providers")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        provider_names = [provider["name"] for provider in payload["providers"]]
        self.assertEqual(provider_names, ["email", "google", "github"])

    def test_register_creates_logged_in_user_with_default_profile(self):
        payload = self.register_and_login()
        self.assertEqual(payload["email"], "alice@example.com")
        self.assertEqual(payload["username"], "alice")
        self.assertTrue(payload["image_url"])

        me_response = self.client.get("/api/auth/session")
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.get_json()["authenticated"], True)

        profile_response = self.client.get("/api/profile")
        self.assertEqual(profile_response.status_code, 200)
        profile = profile_response.get_json()["profile"]
        self.assertEqual(profile["username"], "alice")
        self.assertEqual(profile["bio"], "")
        self.assertEqual(profile["links"], [""])
        self.assertNotIn("organization_name", profile)
        self.assertNotIn("organization_url", profile)
        self.assertTrue(profile["image_url"])

    def test_login_and_profile_update_persist(self):
        password = "another-secret-password"
        self.register_and_login(email="bob@example.com", password=password, username="bob")
        self.client.post("/api/auth/logout")

        login_response = self.login("bob@example.com", password)
        self.assertEqual(login_response.status_code, 200)

        update_response = self.client.put(
            "/api/profile",
            json={
                "username": "bobby",
                "bio": "mental math enthusiast",
                "links": ["https://example.com", "https://github.com/bob"],
                "image_data_url": "data:image/png;base64,ZmFrZQ==",
            },
        )
        self.assertEqual(update_response.status_code, 200)
        updated = update_response.get_json()["profile"]
        self.assertEqual(updated["username"], "bobby")
        self.assertEqual(updated["bio"], "mental math enthusiast")
        self.assertEqual(updated["links"], ["https://example.com", "https://github.com/bob"])
        self.assertNotIn("organization_name", updated)
        self.assertNotIn("organization_url", updated)
        self.assertEqual(updated["image_url"], "data:image/png;base64,ZmFrZQ==")

        self.client.post("/api/auth/logout")
        second_login = self.login("bob@example.com", password)
        self.assertEqual(second_login.status_code, 200)

        profile_response = self.client.get("/api/profile")
        self.assertEqual(profile_response.status_code, 200)
        profile = profile_response.get_json()["profile"]
        self.assertEqual(profile["username"], "bobby")
        self.assertEqual(profile["links"], ["https://example.com", "https://github.com/bob"])
        self.assertNotIn("organization_name", profile)
        self.assertNotIn("organization_url", profile)
        self.assertEqual(profile["image_url"], "data:image/png;base64,ZmFrZQ==")

    def test_public_profile_view_uses_username_slug(self):
        self.register_and_login(email="slug@example.com", username="slugger")
        self.client.put(
            "/api/profile",
            json={
                "username": "slugger",
                "bio": "public bio",
                "links": ["https://example.com"],
            },
        )

        response = self.client.get("/api/profile/slugger")
        self.assertEqual(response.status_code, 200)
        profile = response.get_json()["profile"]
        self.assertEqual(profile["username"], "slugger")
        self.assertEqual(profile["bio"], "public bio")
        self.assertEqual(profile["links"], ["https://example.com"])
        self.assertNotIn("organization_name", profile)
        self.assertNotIn("organization_url", profile)
        self.assertTrue(profile["image_url"])
        self.assertNotIn("email", profile)

    def test_game_results_are_saved_and_analytics_return_score_duration_settings_date_and_time(self):
        self.register_and_login(email="stats@example.com", username="stats")
        first_save = self.client.post(
            "/api/results",
            json={
                "score": 12,
                "duration": 120,
                "settings": self.default_settings(),
                "problem_log": [
                    {"problem": "2 + 2", "answer": 4, "entry": "4", "timeMs": 1100},
                ],
            },
        )
        self.assertEqual(first_save.status_code, 201)

        zero_save = self.client.post(
            "/api/results",
            json={
                "score": 0,
                "duration": 120,
                "settings": self.default_settings(),
                "problem_log": [],
            },
        )
        self.assertEqual(zero_save.status_code, 200)
        self.assertTrue(zero_save.get_json()["skipped"])

        second_save = self.client.post(
            "/api/results",
            json={
                "score": 3,
                "duration": 60,
                "settings": self.default_settings(
                    duration=60,
                    ops=["+", "*"],
                    add_left_max=10,
                    add_right_max=20,
                    mul_right_max=30,
                ),
                "problem_log": [],
            },
        )
        self.assertEqual(second_save.status_code, 201)

        analytics = self.client.get("/api/analytics")
        self.assertEqual(analytics.status_code, 200)
        payload = analytics.get_json()
        self.assertEqual(len(payload["results"]), 2)
        latest = payload["results"][0]
        older = payload["results"][1]
        self.assertEqual(latest["score"], 3)
        self.assertEqual(latest["duration"], 60)
        self.assertTrue(latest["date"])
        self.assertTrue(latest["time"])
        self.assertIn("settings_summary", latest)
        self.assertNotEqual(latest["settings_summary"], "Default")
        self.assertEqual(older["score"], 12)
        self.assertEqual(older["settings_summary"], "Default")
        self.assertNotIn("question_times_ms", latest)
        self.assertNotIn("selected_result", payload)

    def test_leaderboard_ranks_users_by_personal_best(self):
        self.register_and_login(email="low@example.com", username="low")
        self.client.post(
            "/api/results",
            json={"score": 5, "duration": 60, "settings": {"ops": ["+"]}, "problem_log": []},
        )
        self.client.post("/api/auth/logout")

        self.register_and_login(email="high@example.com", username="high")
        self.client.put(
            "/api/profile",
            json={
                "username": "high",
                "links": [""],
                "image_data_url": "data:image/png;base64,aW1hZ2U=",
            },
        )
        self.client.post(
            "/api/results",
            json={"score": 9, "duration": 60, "settings": {"ops": ["+"]}, "problem_log": []},
        )
        self.client.post(
            "/api/results",
            json={"score": 7, "duration": 120, "settings": {"ops": ["*"]}, "problem_log": []},
        )

        leaderboard = self.client.get("/api/leaderboard")
        self.assertEqual(leaderboard.status_code, 200)
        rows = leaderboard.get_json()["leaderboard"]
        self.assertEqual(rows[0]["username"], "high")
        self.assertEqual(rows[0]["pr_score"], 9)
        self.assertEqual(rows[0]["image_url"], "data:image/png;base64,aW1hZ2U=")
        self.assertEqual(rows[0]["username_slug"], "high")
        self.assertEqual(rows[1]["username"], "low")
        self.assertEqual(rows[1]["pr_score"], 5)
        self.assertTrue(all(row["pr_score"] > 0 for row in rows))

    def test_profile_requires_authentication(self):
        response = self.client.get("/api/profile")
        self.assertEqual(response.status_code, 401)

    def test_oauth_start_requires_configuration(self):
        response = self.client.get("/auth/google/start")
        self.assertEqual(response.status_code, 503)
        self.assertIn("not configured", response.get_json()["error"])

    def test_summarize_settings_treats_default_difficulty_with_non_default_duration_as_default(self):
        settings = dict(DEFAULT_CONFIG)
        settings["duration"] = 30
        self.assertEqual(summarize_settings(settings), "Default")


if __name__ == "__main__":
    unittest.main()
