import json
import re
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from .config import DATA, ensure_dirs
from .text import clean_text

_lock = threading.RLock()


def now():
    return datetime.now(UTC).isoformat()


def write_json(path: Path, value):
    with _lock:
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(path)


def read_json(path: Path):
    with _lock:
        return json.loads(path.read_text(encoding="utf-8"))


def valid_id(value):
    if not re.fullmatch(r"[a-f0-9]{32}", value):
        raise ValueError("Invalid identifier")
    return value


def get_material(identifier):
    return read_json(DATA / "materials" / f"{valid_id(identifier)}.json")


def list_materials():
    ensure_dirs()
    return sorted(
        [read_json(p) for p in (DATA / "materials").glob("*.json")],
        key=lambda x: x["created_at"],
        reverse=True,
    )


def save_material(title, text, language="a", source="Text editor"):
    ensure_dirs()
    text = clean_text(text)
    if not text:
        raise ValueError("Please add some text before saving.")
    item = dict(
        id=uuid.uuid4().hex,
        title=title.strip()[:160] or "Untitled material",
        text=text,
        language=language,
        source=source,
        created_at=now(),
        words=len(text.split()),
        characters=len(text),
    )
    write_json(DATA / "materials" / f"{item['id']}.json", item)
    return item


def list_jobs():
    ensure_dirs()
    return sorted(
        [read_json(p) for p in (DATA / "jobs").glob("*.json")],
        key=lambda x: x["created_at"],
        reverse=True,
    )


def get_job(identifier):
    return read_json(DATA / "jobs" / f"{valid_id(identifier)}.json")


def put_job(job):
    write_json(DATA / "jobs" / f"{valid_id(job['id'])}.json", job)
