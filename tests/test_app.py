import io
import zipfile

import pytest

from app import storage
from app.text import chunks, clean_text


def test_clean_markdown_preserves_content():
    assert clean_text("# Hello\n\n**Read** [this](https://example.com).") == "Hello\n\nRead this."


@pytest.mark.parametrize("text", ["This is a sentence. " * 300, "无空格的中文" * 300, "x" * 2000])
def test_chunks_never_drop_long_input(text):
    output = chunks(text)
    assert max(map(len, output)) <= 320
    assert "".join("".join(output).split()) == "".join(text.split())


def test_catalog_and_health(client):
    catalog = client.get("/api/voices").json()
    assert len(catalog["voices"]) == 54
    assert sum(v["id"].startswith("am_") for v in catalog["voices"]) == 9
    assert len(catalog["languages"]) == 9
    assert client.get("/api/health").status_code == 200


def test_upload_round_trip(client):
    response = client.post(
        "/api/materials/upload",
        files={"file": ("article.md", b"# A story\n\nHello **world**.", "text/markdown")},
    )
    assert response.status_code == 201
    item = response.json()
    assert item["text"] == "A story\n\nHello world."
    assert client.get("/api/materials").json()[0]["id"] == item["id"]


@pytest.mark.parametrize(
    "filename, content, status",
    [
        ("bad.pdf", b"x", 422),
        ("empty.txt", b"   ", 422),
        ("bad.txt", b"\xff", 422),
        ("big.txt", b"x" * 400001, 413),
    ],
)
def test_upload_validation(client, filename, content, status):
    assert (
        client.post("/api/materials/upload", files={"file": (filename, content)}).status_code
        == status
    )


@pytest.mark.parametrize(
    "body",
    [
        {"text": "  "},
        {"text": "hello", "voice": "../x"},
        {"text": "hello", "voice": "am_fenrir", "language": "z"},
        {"text": "hello", "speed": 0},
        {"text": "x" * 50001},
        {"text": "hello", "pause": 3},
        {"text": "hello", "kind": "invalid"},
    ],
)
def test_generation_validation(client, body):
    assert client.post("/api/generations", json=body).status_code == 422


def test_unknown_material(client):
    assert (
        client.post("/api/generations", json={"text": "Hello", "material_id": "a" * 32}).status_code
        == 404
    )


def test_edited_text_cannot_replace_original_audio(client):
    material = client.post("/api/materials", json={"text": "Original text"}).json()
    response = client.post(
        "/api/generations", json={"text": "Changed text", "material_id": material["id"]}
    )
    assert response.status_code == 409


def test_local_access_guard(client):
    assert (
        client.post(
            "/api/materials", json={"text": "hello"}, headers={"origin": "https://elsewhere.test"}
        ).status_code
        == 403
    )
    assert client.get("/api/materials", headers={"host": "evil.test"}).status_code == 400
    assert client.get("/api/audio/not-a-file.mp3").status_code == 404


def test_generation_lifecycle_and_download(client, monkeypatch):
    from app import jobs

    def fake_generate(text, voice, speed, pause, output, preview, progress):
        progress(50)
        output.write_bytes(b"ID3-test-audio")
        output.with_suffix(".wav").write_bytes(b"RIFF-test-audio")
        return dict(duration=4, segments=[dict(text=text, start=0, end=4)])

    monkeypatch.setattr(jobs.engine, "generate", fake_generate)
    monkeypatch.setattr(jobs.executor, "submit", lambda fn, identifier: fn(identifier))
    response = client.post("/api/generations", json={"text": "A small story.", "title": "A story"})
    assert response.status_code == 202
    job = client.get(f"/api/generations/{response.json()['id']}").json()
    assert job["status"] == "completed"
    assert job["progress"] == 100
    audio = client.get(job["audio_url"] + "&download=true")
    assert audio.status_code == 200
    assert "attachment" in audio.headers["content-disposition"]
    assert audio.headers["cache-control"] == "private, max-age=31536000, immutable"
    assert (
        client.get(job["audio_url"], headers={"If-None-Match": audio.headers["etag"]}).status_code
        == 304
    )
    partial = client.get(job["audio_url"], headers={"Range": "bytes=0-2"})
    assert partial.status_code == 206 and partial.content == b"ID3"
    assert (
        client.get(job["audio_url"].split("?")[0]).headers["cache-control"] == "private, no-cache"
    )
    from app import main

    (main.DATA / "audio" / f"{job['id']}.mp3").write_bytes(b"ID3-new-version")
    updated = client.get(f"/api/generations/{job['id']}").json()
    assert updated["audio_url"] != job["audio_url"]
    assert client.get(job["audio_url"]).status_code == 410
    assert client.get("/api/materials").headers["cache-control"] == "no-store"
    archive = zipfile.ZipFile(io.BytesIO(client.get("/api/export").content))
    assert any(p.endswith(".mp3") for p in archive.namelist())
    assert any(p.endswith(".txt") for p in archive.namelist())


def test_failure_and_recovery(client, monkeypatch):
    from app import jobs

    def fail(*args, **kwargs):
        raise RuntimeError("Model unavailable")

    monkeypatch.setattr(jobs.engine, "generate", fail)
    monkeypatch.setattr(jobs.executor, "submit", lambda fn, identifier: fn(identifier))
    response = client.post("/api/generations", json={"text": "Hello world"})
    job = storage.get_job(response.json()["id"])
    assert job["status"] == "failed" and "Model unavailable" in job["error"]
    job["status"] = "running"
    storage.put_job(job)
    jobs.recover_jobs()
    assert storage.get_job(job["id"])["status"] == "interrupted"
