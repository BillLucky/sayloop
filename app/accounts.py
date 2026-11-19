"""Local accounts, revocable sessions, and private learning records."""

import hashlib
import hmac
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from . import config

COOKIE = "sayloop_session"
SESSION_SECONDS = 30 * 86400
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
 password TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0,
 goal INTEGER NOT NULL DEFAULT 600, leaderboard INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, expires REAL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, expires REAL);
CREATE TABLE IF NOT EXISTS attempts (identity TEXT, created REAL);
CREATE INDEX IF NOT EXISTS attempts_time ON attempts(created);
CREATE TABLE IF NOT EXISTS study (
 id TEXT PRIMARY KEY, user_id TEXT, job_id TEXT, opened REAL, updated REAL,
 seconds INTEGER NOT NULL DEFAULT 0, position REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT, session_id TEXT, seconds INTEGER, day TEXT, PRIMARY KEY(id, session_id)
);
CREATE INDEX IF NOT EXISTS study_user ON study(user_id);
CREATE INDEX IF NOT EXISTS study_resume ON study(user_id,job_id,updated);
CREATE TABLE IF NOT EXISTS feedback (
 id TEXT PRIMARY KEY, user_id TEXT, target_type TEXT, target_id TEXT,
 rating INTEGER, note TEXT, created REAL
);
"""


@contextmanager
def database():
    config.ensure_dirs()
    path = config.DATA / "accounts.sqlite3"
    path.touch(mode=0o600, exist_ok=True)
    path.chmod(0o600)
    connection = sqlite3.connect(path, timeout=15)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def password_hash(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=5)
    return f"scrypt:16384:8:5:{salt}:{digest.hex()}"


def password_matches(password, encoded):
    fields = encoded.split(":")
    if len(fields) == 2:
        salt, expected = fields
        n, r, p = 16384, 8, 1
    else:
        _, n, r, p, salt, expected = fields
    actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=int(n), r=int(r), p=int(p))
    return hmac.compare_digest(actual.hex(), expected)


def initialize():
    """Provision the owner locally; a network visitor cannot claim existing materials."""
    with database() as db:
        db.executescript(SCHEMA)
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            return
        password = secrets.token_urlsafe(18)
        identifier = uuid.uuid4().hex
        db.execute(
            "INSERT INTO users(id, username, display_name, password, admin) VALUES(?,?,?,?,1)",
            (identifier, "owner", "学习者", password_hash(password)),
        )
        db.execute("INSERT INTO meta VALUES('legacy_owner', ?)", (identifier,))
        path = config.DATA / "OWNER_LOGIN.txt"
        # Restrict permissions before writing any credentials.
        path.touch(mode=0o600, exist_ok=False)
        path.write_text(
            f"Sayloop 首次登录\n账号：owner\n密码：{password}\n"
            "登录后请在学习进度中修改密码。请勿分享此文件。\n",
            encoding="utf-8",
        )
    (config.DATA / "accounts.sqlite3").chmod(0o600)


def public_user(row):
    return {
        key: row[key] for key in ("id", "username", "display_name", "admin", "goal", "leaderboard")
    }


def current_user(token):
    if not token:
        return None
    with database() as db:
        row = db.execute(
            "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id "
            "WHERE token=? AND expires>?",
            (hashlib.sha256(token.encode()).hexdigest(), time.time()),
        ).fetchone()
        return public_user(row) if row else None


def login(username, password, address):
    stamp = time.time()
    identity = f"{address}:{username}"
    with database() as db:
        db.execute("DELETE FROM attempts WHERE created<?", (stamp - 600,))
        failures = db.execute(
            "SELECT COUNT(*) FROM attempts WHERE identity=? OR identity=?", (identity, address)
        ).fetchone()[0]
        if failures >= 10:
            raise HTTPException(429, "登录尝试过多，请十分钟后再试。")
        row = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        comparison = row or db.execute("SELECT * FROM users LIMIT 1").fetchone()
        matches = password_matches(password, comparison["password"])
        if not row or not matches:
            db.execute("INSERT INTO attempts VALUES(?,?)", (identity, stamp))
            db.execute("INSERT INTO attempts VALUES(?,?)", (address, stamp))
        else:
            token = secrets.token_urlsafe(32)
            db.execute("DELETE FROM sessions WHERE expires<?", (stamp,))
            db.execute(
                "INSERT INTO sessions VALUES(?,?,?)",
                (hashlib.sha256(token.encode()).hexdigest(), row["id"], stamp + SESSION_SECONDS),
            )
            db.execute("DELETE FROM attempts WHERE identity=?", (identity,))
            return token, public_user(row)
    raise HTTPException(401, "账号或密码不正确。")


def logout(token):
    with database() as db:
        db.execute(
            "DELETE FROM sessions WHERE token=?", (hashlib.sha256(token.encode()).hexdigest(),)
        )


def invite():
    token = secrets.token_urlsafe(18)
    with database() as db:
        db.execute("DELETE FROM invites WHERE expires<?", (time.time(),))
        db.execute(
            "INSERT INTO invites VALUES(?,?)",
            (hashlib.sha256(token.encode()).hexdigest(), time.time() + 86400),
        )
    return token


def register(username, display_name, password, code):
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        token = hashlib.sha256(code.encode()).hexdigest()
        if not db.execute(
            "SELECT 1 FROM invites WHERE token=? AND expires>?", (token, time.time())
        ).fetchone():
            raise HTTPException(403, "邀请码无效或已过期，请向管理员获取新的邀请码。")
        try:
            db.execute(
                "INSERT INTO users(id,username,display_name,password) VALUES(?,?,?,?)",
                (uuid.uuid4().hex, username, display_name, password_hash(password)),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "这个账号名已被使用。") from None
        db.execute("DELETE FROM invites WHERE token=?", (token,))


def owner_id(item):
    if item.get("owner_id"):
        return item["owner_id"]
    with database() as db:
        row = db.execute("SELECT value FROM meta WHERE key='legacy_owner'").fetchone()
        return row[0] if row else None


def can_read(item, user):
    if owner_id(item) == user["id"] or item.get("visibility") == "shared":
        return True
    if item.get("material_id"):
        from .storage import get_material

        try:
            material = get_material(item["material_id"])
            return owner_id(item) == owner_id(material) and can_read(material, user)
        except (ValueError, FileNotFoundError):
            return False
    return False


def require_read(item, user):
    if not can_read(item, user):
        raise HTTPException(404, "内容不存在或没有访问权限。")
    return item


def day_now():
    return datetime.now(ZoneInfo("Asia/Shanghai")).date()


def record_event(user, session_id, event_id, seconds, position):
    stamp = time.time()
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT * FROM study WHERE id=? AND user_id=?", (session_id, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(404, "练习记录不存在。")
        if db.execute(
            "SELECT 1 FROM events WHERE id=? AND session_id=?", (event_id, session_id)
        ).fetchone():
            return
        # Wall time bounds reports, including duplicate tabs and reconnect bursts.
        latest = db.execute(
            "SELECT MAX(updated) FROM study WHERE user_id=?", (user["id"],)
        ).fetchone()[0]
        credited = max(0, min(seconds, int(stamp - max(row["updated"], latest or 0)), 30))
        db.execute(
            "INSERT INTO events VALUES(?,?,?,?)", (event_id, session_id, credited, str(day_now()))
        )
        db.execute(
            "UPDATE study SET updated=?,seconds=seconds+?,position=? WHERE id=?",
            (stamp, credited, position, session_id),
        )


def resume_position(user, job):
    """Read only this learner's latest recorded position, excluding unopened sessions."""
    if job.get("kind") != "full" or job.get("status") != "completed":
        return 0.0
    with database() as db:
        row = db.execute(
            "SELECT position FROM study WHERE user_id=? AND job_id=? AND updated>opened "
            "ORDER BY updated DESC LIMIT 1",
            (user["id"], job["id"]),
        ).fetchone()
    position = max(0.0, float(row["position"])) if row else 0.0
    duration = max(0.0, float(job.get("duration") or 0))
    return position if 2 <= position < duration - 1 else 0.0


def statistics(user):
    today = day_now()
    with database() as db:
        days = {
            row["day"]: row["seconds"]
            for row in db.execute(
                "SELECT day,SUM(events.seconds) AS seconds FROM events JOIN study ON study.id=events.session_id "
                "WHERE user_id=? GROUP BY day",
                (user["id"],),
            )
        }
        recent = [
            dict(row)
            for row in db.execute(
                "SELECT job_id,MAX(updated) AS updated,SUM(seconds) AS seconds FROM study "
                "WHERE user_id=? GROUP BY job_id ORDER BY updated DESC LIMIT 10",
                (user["id"],),
            )
        ]
        board = [
            dict(row)
            for row in db.execute(
                "SELECT users.display_name,COALESCE(SUM(events.seconds),0) AS seconds FROM users "
                "LEFT JOIN study ON study.user_id=users.id LEFT JOIN events ON events.session_id=study.id "
                "AND events.day>=? WHERE users.leaderboard=1 GROUP BY users.id "
                "ORDER BY seconds DESC,users.id LIMIT 20",
                (str(today - timedelta(days=6)),),
            )
        ]
    cursor = today if days.get(str(today), 0) else today - timedelta(days=1)
    streak = 0
    while days.get(str(cursor), 0) > 0:
        streak += 1
        cursor -= timedelta(days=1)
    total = sum(days.values())
    return dict(
        today=days.get(str(today), 0),
        total=total,
        streak=streak,
        goal=user["goal"],
        days=[
            dict(
                day=str(today - timedelta(days=i)),
                seconds=days.get(str(today - timedelta(days=i)), 0),
            )
            for i in reversed(range(14))
        ],
        recent=recent,
        leaderboard=board,
        milestones=[dict(minutes=m, achieved=total >= m * 60) for m in (10, 60, 300, 1000)],
    )
