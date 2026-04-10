from __future__ import annotations

from functools import wraps
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
from typing import Any
from urllib.parse import quote

from flask import Flask, g, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from arithmetic import ArithmeticConfigError, DEFAULT_CONFIG, generate_problem, normalize_config

try:
    from authlib.integrations.flask_client import OAuth
except ImportError:  # pragma: no cover
    OAuth = None

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SLUG_SAFE_RE = re.compile(r"[^a-z0-9]+")
DEFAULT_SECRET_KEY = "local-change-me"
DEFAULT_SETTINGS_SUMMARY = "Default"
SETTINGS_KEYS_IGNORING_DURATION = (
    "ops",
    "add_left_min",
    "add_left_max",
    "add_right_min",
    "add_right_max",
    "mul_left_min",
    "mul_left_max",
    "mul_right_min",
    "mul_right_max",
)
SETTINGS_SUMMARY_GROUPS = (
    (("add_left_min", "add_left_max", "add_right_min", "add_right_max"), "add"),
    (("mul_left_min", "mul_left_max", "mul_right_min", "mul_right_max"), "mul"),
)


def _settings_without_duration(settings: dict[str, Any]) -> dict[str, Any]:
    return {key: settings.get(key) for key in SETTINGS_KEYS_IGNORING_DURATION}

def username_to_slug(username: str) -> str:
    base = SLUG_SAFE_RE.sub("-", username.strip().lower()).strip("-")
    return base or "user"


def summarize_settings(settings: dict[str, Any]) -> str:
    if not settings:
        return DEFAULT_SETTINGS_SUMMARY

    try:
        normalized = normalize_config(settings)
        if _settings_without_duration(normalized) == _settings_without_duration(normalize_config(DEFAULT_CONFIG)):
            return DEFAULT_SETTINGS_SUMMARY
    except ArithmeticConfigError:
        normalized = settings

    parts = []
    ops = normalized.get("ops") or []
    if ops:
        parts.append("ops=" + "".join(ops))

    for key_group, label in SETTINGS_SUMMARY_GROUPS:
        if all(key in normalized for key in key_group):
            parts.append(
                f"{label}=({normalized[key_group[0]]}-{normalized[key_group[1]]})/({normalized[key_group[2]]}-{normalized[key_group[3]]})"
            )

    return "; ".join(parts) if parts else DEFAULT_SETTINGS_SUMMARY


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__, static_folder="dist", static_url_path="")
    default_db_path = ROOT_DIR / "webapp" / "data" / "arithmetic.db"
    oauth_redirect_base = "http://127.0.0.1:8000/auth"
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", DEFAULT_SECRET_KEY),
        DATABASE_PATH=str(default_db_path),
        GOOGLE_CLIENT_ID=os.environ.get("GOOGLE_CLIENT_ID", ""),
        GOOGLE_CLIENT_SECRET=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        GOOGLE_REDIRECT_URI=os.environ.get("GOOGLE_REDIRECT_URI", f"{oauth_redirect_base}/google/callback"),
        GITHUB_CLIENT_ID=os.environ.get("GITHUB_CLIENT_ID", ""),
        GITHUB_CLIENT_SECRET=os.environ.get("GITHUB_CLIENT_SECRET", ""),
        GITHUB_REDIRECT_URI=os.environ.get("GITHUB_REDIRECT_URI", f"{oauth_redirect_base}/github/callback"),
    )
    if test_config:
        app.config.update(test_config)

    Path(app.config["DATABASE_PATH"]).parent.mkdir(parents=True, exist_ok=True)

    oauth = OAuth(app) if OAuth is not None else None
    if oauth is not None and app.config["GOOGLE_CLIENT_ID"] and app.config["GOOGLE_CLIENT_SECRET"]:
        oauth.register(
            name="google",
            client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
    if oauth is not None and app.config["GITHUB_CLIENT_ID"] and app.config["GITHUB_CLIENT_SECRET"]:
        oauth.register(
            name="github",
            client_id=app.config["GITHUB_CLIENT_ID"],
            client_secret=app.config["GITHUB_CLIENT_SECRET"],
            access_token_url="https://github.com/login/oauth/access_token",
            authorize_url="https://github.com/login/oauth/authorize",
            api_base_url="https://api.github.com/",
            client_kwargs={"scope": "read:user user:email"},
        )
    app.oauth = oauth

    @app.teardown_appcontext
    def close_db(_: Exception | None) -> None:
        db = g.pop("db", None)
        if db is not None:
            db.close()

    def get_db() -> sqlite3.Connection:
        if "db" not in g:
            connection = sqlite3.connect(app.config["DATABASE_PATH"])
            connection.row_factory = sqlite3.Row
            g.db = connection
        return g.db

    def init_db() -> None:
        db = get_db()
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                auth_provider TEXT NOT NULL DEFAULT 'email',
                provider_user_id TEXT,
                username TEXT NOT NULL,
                username_slug TEXT NOT NULL UNIQUE,
                bio TEXT NOT NULL DEFAULT '',
                image_data_url TEXT NOT NULL DEFAULT '',
                links_json TEXT NOT NULL DEFAULT '[""]',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity
            ON users (auth_provider, provider_user_id);
            CREATE TABLE IF NOT EXISTS game_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                score INTEGER NOT NULL,
                duration INTEGER NOT NULL,
                settings_json TEXT NOT NULL,
                settings_summary TEXT NOT NULL,
                problem_log_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )

        columns = {row[1] for row in db.execute("PRAGMA table_info(users)").fetchall()}
        migrations = {
            "username_slug": "ALTER TABLE users ADD COLUMN username_slug TEXT",
            "image_data_url": "ALTER TABLE users ADD COLUMN image_data_url TEXT NOT NULL DEFAULT ''",
        }
        for column, statement in migrations.items():
            if column not in columns:
                db.execute(statement)
        if "links_json" in columns:
            db.execute("UPDATE users SET links_json = '[\"\"]' WHERE links_json IS NULL OR links_json = ''")
        users_without_slug = db.execute(
            "SELECT id, username FROM users WHERE username_slug IS NULL OR username_slug = ''"
        ).fetchall()
        for row in users_without_slug:
            db.execute(
                "UPDATE users SET username_slug = ? WHERE id = ?",
                (username_to_slug(row["username"]), row["id"]),
            )
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_slug ON users(username_slug)")
        db.execute("DELETE FROM game_results WHERE score <= 0")
        db.commit()

    def sanitize_username(raw: Any, fallback_email: str = "") -> str:
        base = str(raw or "").strip()
        if not base and fallback_email:
            base = fallback_email.split("@", 1)[0]
        base = re.sub(r"\s+", " ", base)
        if not base:
            raise ValueError("username is required")
        return base[:40]

    def validate_email(email: Any) -> str:
        normalized = str(email or "").strip().lower()
        if not EMAIL_RE.match(normalized):
            raise ValueError("valid email is required")
        return normalized

    def normalize_links(links_value: Any) -> list[str]:
        if isinstance(links_value, list):
            links = [str(link).strip() for link in links_value]
        elif isinstance(links_value, str):
            links = [line.strip() for line in links_value.splitlines()]
        elif links_value in (None, ""):
            links = [""]
        else:
            raise ValueError("links must be a list or newline separated string")
        trimmed = links[:10]
        return trimmed if trimmed else [""]

    def normalize_problem_log(problem_log: Any) -> list[dict[str, Any]]:
        if not isinstance(problem_log, list):
            return []
        normalized = []
        for item in problem_log:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "problem": str(item.get("problem") or ""),
                    "answer": item.get("answer"),
                    "entry": str(item.get("entry") or ""),
                    "timeMs": int(item.get("timeMs") or 0),
                }
            )
        return normalized

    def normalize_image_data_url(value: Any) -> str:
        data_url = str(value or "").strip()
        if not data_url:
            return ""
        if not data_url.startswith("data:image/"):
            raise ValueError("profile image must be an image data URL")
        return data_url[:2_000_000]

    def avatar_url(row_or_username: sqlite3.Row | str) -> str:
        if isinstance(row_or_username, sqlite3.Row):
            custom = str(row_or_username["image_data_url"] or "")
            if custom:
                return custom
            username = row_or_username["username"]
        else:
            username = row_or_username
        safe_name = quote(username or "user")
        return f"/api/avatar/default.svg?name={safe_name}"

    def unique_slug_for_username(username: str, user_id: int | None = None) -> str:
        base_slug = username_to_slug(username)
        db = get_db()
        attempt = 0
        while True:
            slug = base_slug if attempt == 0 else f"{base_slug}-{attempt + 1}"
            row = db.execute("SELECT id FROM users WHERE username_slug = ?", (slug,)).fetchone()
            if row is None or (user_id is not None and row["id"] == user_id):
                return slug
            attempt += 1

    def row_to_user(row: sqlite3.Row) -> dict[str, Any]:
        slug = row["username_slug"] or username_to_slug(row["username"])
        return {
            "id": row["id"],
            "email": row["email"],
            "username": row["username"],
            "username_slug": slug,
            "auth_provider": row["auth_provider"],
            "bio": row["bio"],
            "links": json.loads(row["links_json"] or '[""]'),
            "image_url": avatar_url(row),
        }

    def public_profile_from_row(row: sqlite3.Row) -> dict[str, Any]:
        user = row_to_user(row)
        user.pop("email", None)
        user.pop("auth_provider", None)
        return user

    def result_row_to_payload(row: sqlite3.Row) -> dict[str, Any]:
        settings = json.loads(row["settings_json"] or "{}")
        created_at = str(row["created_at"] or "")
        created_date, _, created_time = created_at.partition(" ")
        return {
            "id": row["id"],
            "score": row["score"],
            "duration": row["duration"],
            "created_at": created_at,
            "date": created_date,
            "time": created_time,
            "settings": settings,
            "settings_summary": summarize_settings(settings),
        }

    def get_user_by_id(user_id: int | None) -> sqlite3.Row | None:
        if user_id is None:
            return None
        return get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    def get_current_user() -> sqlite3.Row | None:
        return get_user_by_id(session.get("user_id"))

    def login_user(user_id: int) -> None:
        session["user_id"] = user_id

    def logout_user() -> None:
        session.pop("user_id", None)

    def provider_configured(provider: str) -> bool:
        if provider == "email":
            return True
        if provider == "google":
            return bool(oauth is not None and getattr(oauth, "google", None) is not None)
        if provider == "github":
            return bool(oauth is not None and getattr(oauth, "github", None) is not None)
        return False

    def auth_required(view_func):
        @wraps(view_func)
        def wrapped(*args, **kwargs):
            user = get_current_user()
            if user is None:
                return jsonify({"error": "authentication required"}), 401
            return view_func(user, *args, **kwargs)

        return wrapped

    @app.get("/api/avatar/default.svg")
    def default_avatar():
        name = (request.args.get("name") or "User").strip()[:40] or "User"
        initials = "".join(part[:1].upper() for part in name.split()[:2]) or name[:2].upper()
        svg = f"""
        <svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160' role='img' aria-label='Avatar'>
          <rect width='160' height='160' rx='18' fill='#303038'/>
          <circle cx='80' cy='62' r='28' fill='#8ab4ff'/>
          <path d='M40 138c6-26 29-42 40-42s34 16 40 42' fill='#8ab4ff'/>
          <text x='80' y='150' text-anchor='middle' font-family='Helvetica Neue, Arial, sans-serif' font-size='18' fill='#f4f4f5'>{initials}</text>
        </svg>
        """.strip()
        return app.response_class(svg, mimetype="image/svg+xml")

    @app.get("/api/problem")
    def unsupported_problem_get():
        return jsonify({"error": "use POST /api/problem"}), 405

    @app.post("/api/problem")
    def get_problem():
        data = request.get_json(silent=True) or {}
        try:
            config = normalize_config(data)
            problem = generate_problem(config)
        except ArithmeticConfigError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify(problem.to_dict())

    @app.get("/api/defaults")
    def get_defaults():
        return jsonify(DEFAULT_CONFIG)

    @app.get("/api/auth/providers")
    def auth_providers():
        return jsonify(
            {
                "providers": [
                    {"name": "email", "label": "Email", "available": True, "start_url": None},
                    {
                        "name": "google",
                        "label": "Google",
                        "available": provider_configured("google"),
                        "start_url": "/auth/google/start",
                    },
                    {
                        "name": "github",
                        "label": "GitHub",
                        "available": provider_configured("github"),
                        "start_url": "/auth/github/start",
                    },
                ]
            }
        )

    @app.get("/api/auth/session")
    def auth_session():
        user = get_current_user()
        if user is None:
            return jsonify({"authenticated": False, "user": None})
        return jsonify({"authenticated": True, "user": row_to_user(user)})

    @app.post("/api/auth/register")
    def auth_register():
        data = request.get_json(silent=True) or {}
        try:
            email = validate_email(data.get("email"))
            password = str(data.get("password") or "")
            if len(password) < 8:
                raise ValueError("password must be at least 8 characters")
            username = sanitize_username(data.get("username"), email)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        db = get_db()
        existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing is not None:
            return jsonify({"error": "an account with that email already exists"}), 409

        username_slug = unique_slug_for_username(username)
        cursor = db.execute(
            """
            INSERT INTO users (
                email, password_hash, auth_provider, username, username_slug,
                bio, image_data_url, links_json
            )
            VALUES (?, ?, 'email', ?, ?, '', '', '[""]')
            """,
            (email, generate_password_hash(password), username, username_slug),
        )
        db.commit()
        login_user(cursor.lastrowid)
        created = get_user_by_id(cursor.lastrowid)
        return jsonify({"user": row_to_user(created)}), 201

    @app.post("/api/auth/login")
    def auth_login():
        data = request.get_json(silent=True) or {}
        try:
            email = validate_email(data.get("email"))
            password = str(data.get("password") or "")
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        user = get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user is None or not user["password_hash"]:
            return jsonify({"error": "invalid email or password"}), 401
        if not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "invalid email or password"}), 401

        login_user(user["id"])
        return jsonify({"user": row_to_user(user)})

    @app.post("/api/auth/logout")
    def auth_logout():
        logout_user()
        return jsonify({"ok": True})

    @app.get("/api/profile")
    @auth_required
    def get_profile(current_user: sqlite3.Row):
        return jsonify({"profile": row_to_user(current_user)})

    @app.get("/api/profile/<slug>")
    def get_public_profile(slug: str):
        user = get_db().execute("SELECT * FROM users WHERE username_slug = ?", (slug,)).fetchone()
        if user is None:
            return jsonify({"error": "profile not found"}), 404
        return jsonify({"profile": public_profile_from_row(user)})

    @app.put("/api/profile")
    @auth_required
    def update_profile(current_user: sqlite3.Row):
        data = request.get_json(silent=True) or {}
        try:
            username = sanitize_username(data.get("username"), current_user["email"])
            bio = str(data.get("bio") or "").strip()[:300]
            links = normalize_links(data.get("links"))
            image_data_url = normalize_image_data_url(data.get("image_data_url"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        db = get_db()
        username_slug = unique_slug_for_username(username, current_user["id"])
        db.execute(
            """
            UPDATE users
            SET username = ?, username_slug = ?, bio = ?, links_json = ?, image_data_url = ?
            WHERE id = ?
            """,
            (
                username,
                username_slug,
                bio,
                json.dumps(links),
                image_data_url,
                current_user["id"],
            ),
        )
        db.commit()
        refreshed = get_user_by_id(current_user["id"])
        return jsonify({"profile": row_to_user(refreshed)})

    @app.post("/api/results")
    @auth_required
    def save_result(current_user: sqlite3.Row):
        data = request.get_json(silent=True) or {}
        score = int(data.get("score") or 0)
        if score <= 0:
            return jsonify({"skipped": True}), 200
        duration = int(data.get("duration") or 0)
        settings = data.get("settings") if isinstance(data.get("settings"), dict) else {}
        problem_log = normalize_problem_log(data.get("problem_log"))
        settings_summary = summarize_settings(settings)

        cursor = get_db().execute(
            """
            INSERT INTO game_results (user_id, score, duration, settings_json, settings_summary, problem_log_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                current_user["id"],
                score,
                duration,
                json.dumps(settings),
                settings_summary,
                json.dumps(problem_log),
            ),
        )
        get_db().commit()
        row = get_db().execute("SELECT * FROM game_results WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return jsonify({"result": result_row_to_payload(row)}), 201

    @app.get("/api/analytics")
    @auth_required
    def analytics(current_user: sqlite3.Row):
        result_rows = get_db().execute(
            "SELECT * FROM game_results WHERE user_id = ? AND score > 0 ORDER BY id DESC",
            (current_user["id"],),
        ).fetchall()
        results = [result_row_to_payload(row) for row in result_rows]
        return jsonify({"results": results})

    @app.get("/api/leaderboard")
    def leaderboard():
        rows = get_db().execute(
            """
            SELECT u.username, u.username_slug, u.image_data_url, MAX(r.score) AS pr_score
            FROM users u
            JOIN game_results r ON r.user_id = u.id
            WHERE r.score > 0
            GROUP BY u.id, u.username, u.username_slug, u.image_data_url
            ORDER BY pr_score DESC, u.username ASC
            """
        ).fetchall()
        return jsonify(
            {
                "leaderboard": [
                    {
                        "rank": index + 1,
                        "username": row["username"],
                        "username_slug": row["username_slug"],
                        "pr_score": row["pr_score"],
                        "image_url": row["image_data_url"] or avatar_url(row["username"]),
                    }
                    for index, row in enumerate(rows)
                ]
            }
        )

    def upsert_oauth_user(*, email: str, username: str, provider: str, provider_user_id: str) -> sqlite3.Row:
        db = get_db()
        existing = db.execute(
            "SELECT * FROM users WHERE auth_provider = ? AND provider_user_id = ?",
            (provider, provider_user_id),
        ).fetchone()
        if existing is not None:
            new_slug = unique_slug_for_username(username, existing["id"])
            if existing["username"] != username or existing["email"] != email or existing["username_slug"] != new_slug:
                db.execute(
                    "UPDATE users SET email = ?, username = ?, username_slug = ? WHERE id = ?",
                    (email, username, new_slug, existing["id"]),
                )
                db.commit()
                return get_user_by_id(existing["id"])
            return existing

        email_owner = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if email_owner is not None:
            new_slug = unique_slug_for_username(username, email_owner["id"])
            db.execute(
                "UPDATE users SET auth_provider = ?, provider_user_id = ?, username = ?, username_slug = ? WHERE id = ?",
                (provider, provider_user_id, username, new_slug, email_owner["id"]),
            )
            db.commit()
            return get_user_by_id(email_owner["id"])

        username_slug = unique_slug_for_username(username)
        cursor = db.execute(
            """
            INSERT INTO users (
                email, password_hash, auth_provider, provider_user_id, username, username_slug,
                bio, image_data_url, links_json
            )
            VALUES (?, NULL, ?, ?, ?, ?, '', '', '[""]')
            """,
            (email, provider, provider_user_id, username, username_slug),
        )
        db.commit()
        return get_user_by_id(cursor.lastrowid)

    @app.get("/auth/google/start")
    def auth_google_start():
        if not provider_configured("google"):
            return jsonify({"error": "google login is not configured locally"}), 503
        return oauth.google.authorize_redirect(app.config["GOOGLE_REDIRECT_URI"])

    @app.get("/auth/google/callback")
    def auth_google_callback():
        if not provider_configured("google"):
            return jsonify({"error": "google login is not configured locally"}), 503
        token = oauth.google.authorize_access_token()
        userinfo = token.get("userinfo") or oauth.google.userinfo()
        email = validate_email(userinfo.get("email"))
        username = sanitize_username(userinfo.get("name") or userinfo.get("email"), email)
        provider_user_id = str(userinfo.get("sub") or email)
        user = upsert_oauth_user(
            email=email,
            username=username,
            provider="google",
            provider_user_id=provider_user_id,
        )
        login_user(user["id"])
        return redirect("/")

    @app.get("/auth/github/start")
    def auth_github_start():
        if not provider_configured("github"):
            return jsonify({"error": "github login is not configured locally"}), 503
        return oauth.github.authorize_redirect(app.config["GITHUB_REDIRECT_URI"])

    @app.get("/auth/github/callback")
    def auth_github_callback():
        if not provider_configured("github"):
            return jsonify({"error": "github login is not configured locally"}), 503
        oauth.github.authorize_access_token()
        profile = oauth.github.get("user").json()
        emails = oauth.github.get("user/emails").json()
        primary_email = next((item["email"] for item in emails if item.get("primary")), None) or profile.get("email")
        email = validate_email(primary_email)
        username = sanitize_username(profile.get("name") or profile.get("login") or email, email)
        provider_user_id = str(profile.get("id") or email)
        user = upsert_oauth_user(
            email=email,
            username=username,
            provider="github",
            provider_user_id=provider_user_id,
        )
        login_user(user["id"])
        return redirect("/")

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path: str):
        static_dir = Path(app.static_folder)
        requested = static_dir / path
        if path.startswith("api/"):
            return jsonify({"error": "not found"}), 404
        if path and requested.exists() and requested.is_file():
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")

    with app.app_context():
        init_db()

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=8000)
