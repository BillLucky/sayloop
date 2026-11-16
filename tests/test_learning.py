"""Multi-account boundaries and authoring/study regression coverage."""

import io
import json
import time
import uuid
import zipfile
from urllib.error import URLError

from app import accounts, compositions, storage


def switch_user(client, username="learner"):
    code = client.post("/api/auth/invite").json()["code"]
    assert (
        client.post(
            "/api/auth/register",
            json=dict(
                username=username,
                password="another-test-password",
                display_name="Learner",
                invite_code=code,
            ),
        ).status_code
        == 201
    )
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login", json=dict(username=username, password="another-test-password")
        ).status_code
        == 200
    )
    return code


def owner_login(client):
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login", json=dict(username="owner", password="test-password-only")
        ).status_code
        == 200
    )


def completed_job(client, monkeypatch):
    from app import jobs

    def fake(text, voice, speed, pause, output, preview, progress):
        output.write_bytes(b"ID3-synthetic-audio")
        output.with_suffix(".wav").write_bytes(b"RIFF-synthetic-audio")
        return dict(duration=10, segments=[dict(text=text, start=0, end=10)])

    monkeypatch.setattr(jobs.engine, "generate", fake)
    monkeypatch.setattr(jobs.executor, "submit", lambda fn, identifier: fn(identifier))
    material = client.post(
        "/api/materials", json=dict(text="Synthetic private material.", title="Private")
    ).json()
    job = client.post(
        "/api/generations", json=dict(text=material["text"], material_id=material["id"])
    ).json()
    return material, client.get("/api/generations/" + job["id"]).json()


def test_unauthenticated_content_and_downloads_are_blocked(client):
    client.post("/api/auth/logout")
    for path in (
        "/api/materials",
        "/api/generations",
        "/api/audio/" + "a" * 32 + ".mp3",
        "/api/export",
        "/api/compositions",
        "/api/study/stats",
        "/api/feedback",
    ):
        response = client.get(path)
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/auth/me").json() == dict(user=None)


def test_invitation_one_use_and_admin_only(client):
    code = switch_user(client)
    assert client.post("/api/auth/invite").status_code == 403
    response = client.post(
        "/api/auth/register",
        json=dict(
            username="someone",
            password="another-test-password",
            display_name="Someone",
            invite_code=code,
        ),
    )
    assert response.status_code == 403


def test_login_cookie_revocation_and_password_change(client):
    response = client.post(
        "/api/auth/login", json=dict(username="owner", password="test-password-only")
    )
    assert (
        "HttpOnly" in response.headers["set-cookie"]
        and "SameSite=strict" in response.headers["set-cookie"]
    )
    token = client.cookies.get(accounts.COOKIE)
    assert (
        client.post(
            "/api/auth/password", json=dict(current="wrong", new="new-test-password")
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/auth/password", json=dict(current="test-password-only", new="new-test-password")
        ).status_code
        == 200
    )
    assert accounts.current_user(token) is None
    assert client.get("/api/materials").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json=dict(username="owner", password="new-test-password")
        ).status_code
        == 200
    )


def test_login_rate_limit(client):
    client.post("/api/auth/logout")
    for _ in range(5):
        assert (
            client.post(
                "/api/auth/login", json=dict(username="owner", password="incorrect")
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/auth/login", json=dict(username="owner", password="incorrect")
        ).status_code
        == 429
    )


def test_legacy_library_claimed_by_owner_without_rewriting(client):
    legacy = storage.save_material("Legacy", "Synthetic older text.")
    assert legacy["id"] in {m["id"] for m in client.get("/api/materials").json()}
    before = storage.get_material(legacy["id"])
    switch_user(client)
    assert client.get("/api/materials").json() == []
    assert storage.get_material(legacy["id"]) == before


def test_cross_account_audio_metadata_export_and_etag(client, monkeypatch):
    material, job = completed_job(client, monkeypatch)
    etag = client.get(job["audio_url"]).headers["etag"]
    switch_user(client)
    assert client.get("/api/materials").json() == []
    assert client.get("/api/generations").json() == []
    assert client.get("/api/generations/" + job["id"]).status_code == 404
    assert client.get(job["audio_url"], headers={"If-None-Match": etag}).status_code == 404
    assert (
        client.post(
            "/api/generations", json=dict(text=material["text"], material_id=material["id"])
        ).status_code
        == 404
    )
    assert client.post("/api/study/sessions", json=dict(job_id=job["id"])).status_code == 404
    assert zipfile.ZipFile(io.BytesIO(client.get("/api/export").content)).namelist() == []


def test_sharing_and_revoking_covers_recordings(client, monkeypatch):
    material, job = completed_job(client, monkeypatch)
    meta = dict(
        title="Shared lesson",
        tags=["negotiation"],
        visibility="shared",
        favorite=True,
        archived=False,
    )
    assert client.patch("/api/materials/" + material["id"], json=meta).status_code == 200
    switch_user(client)
    assert client.get("/api/materials?q=negotiation&language=a").json()[0]["owned"] is False
    assert client.get(job["audio_url"]).status_code == 200
    assert client.patch("/api/materials/" + material["id"], json=meta).status_code == 404
    owner_login(client)
    meta["visibility"] = "private"
    client.patch("/api/materials/" + material["id"], json=meta)
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json=dict(username="learner", password="another-test-password"))
    assert client.get(job["audio_url"]).status_code == 404


def test_uploads_owned_and_feedback_private(client):
    material = client.post(
        "/api/materials/upload", files={"file": ("lesson.txt", b"Hello there.")}
    ).json()
    assert material["owner_id"] == client.get("/api/auth/me").json()["user"]["id"]
    assert (
        client.post(
            "/api/feedback",
            json=dict(
                target_type="material", target_id=material["id"], rating=3, note="Slower please"
            ),
        ).status_code
        == 201
    )
    switch_user(client)
    assert client.get("/api/feedback").json() == []
    assert (
        client.post(
            "/api/feedback", json=dict(target_type="material", target_id=material["id"], rating=5)
        ).status_code
        == 404
    )


def fake_result(mode, count, turns=4):
    if mode == "polish":
        return compositions.Result(title="Synthetic lesson", chinese="我们来讨论交付时间。")
    if mode == "variants":
        return compositions.Result(
            title="Synthetic lesson",
            variants=[
                compositions.Variant(label=str(i), text="Could we discuss the schedule?")
                for i in range(count)
            ],
        )
    return compositions.Result(
        title="Synthetic lesson",
        dialogues=[
            compositions.Dialogue(
                title=f"Scene {i}",
                role_a="Buyer",
                role_b="Seller",
                turns=[
                    compositions.Turn(
                        speaker="A" if i % 2 == 0 else "B",
                        text="Could we discuss the schedule?",
                        translation="讨论交付时间。",
                    )
                    for i in range(turns)
                ],
            )
            for i in range(count)
        ],
    )


def test_authoring_fallback_and_private_revisions(client, monkeypatch):
    monkeypatch.setattr(
        compositions, "providers", lambda: [dict(name="primary"), dict(name="fallback")]
    )
    calls = []

    def model(provider, messages):
        calls.append(provider["name"])
        if provider["name"] == "primary":
            raise URLError("Unavailable")
        assert "source" in json.loads(messages[1]["content"])
        return fake_result("polish", 1)

    monkeypatch.setattr(compositions, "request_model", model)
    monkeypatch.setattr(compositions.executor, "submit", lambda fn, identifier: fn(identifier))
    job = client.post("/api/compositions", json=dict(mode="polish", source="讨论交付")).json()
    item = client.get("/api/compositions/" + job["id"]).json()
    assert item["status"] == "completed" and item["providers"] == ["fallback"]
    assert calls == ["primary", "fallback"]
    second = client.post(
        "/api/compositions", json=dict(mode="polish", source="再讨论", parent_id=item["id"])
    ).json()
    assert second["id"] != item["id"]
    switch_user(client)
    assert client.get("/api/compositions").json() == []
    assert client.get("/api/compositions/" + item["id"]).status_code == 404
    assert (
        client.post(
            "/api/compositions", json=dict(mode="polish", source="x", parent_id=item["id"])
        ).status_code
        == 404
    )


def test_thirty_dialogues_batched_and_validated(client, monkeypatch):
    monkeypatch.setattr(compositions, "providers", lambda: [dict(name="synthetic")])
    calls = []

    def model(provider, messages):
        calls.append(messages)
        result = fake_result("scenario", 3)
        for index, dialogue in enumerate(result.dialogues):
            for turn_index, turn in enumerate(dialogue.turns):
                turn.text = f"Batch {len(calls)}, scene {index}, turn {turn_index}."
        return result

    monkeypatch.setattr(compositions, "request_model", model)
    monkeypatch.setattr(compositions.executor, "submit", lambda fn, identifier: fn(identifier))
    item = client.post(
        "/api/compositions",
        json=dict(mode="scenario", source="Synthetic contract negotiation", count=30, turns=4),
    ).json()
    result = client.get("/api/compositions/" + item["id"]).json()
    assert result["status"] == "completed"
    assert len(result["result"]["dialogues"]) == 30 and len(calls) == 10


def test_invalid_model_output_fails_without_losing_source(client, monkeypatch):
    monkeypatch.setattr(compositions, "providers", lambda: [dict(name="synthetic")])
    monkeypatch.setattr(compositions, "request_model", lambda *args: fake_result("scenario", 1))
    monkeypatch.setattr(compositions.executor, "submit", lambda fn, identifier: fn(identifier))
    item = client.post(
        "/api/compositions", json=dict(mode="scenario", source="Original request", count=3)
    ).json()
    result = client.get("/api/compositions/" + item["id"]).json()
    assert result["status"] == "failed" and result["input"]["source"] == "Original request"
    assert "result" not in result


def test_authoring_limits_recovery_and_whitespace(client, monkeypatch):
    monkeypatch.setattr(compositions.executor, "submit", lambda *args: None)
    assert (
        client.post("/api/compositions", json=dict(mode="polish", source="   ")).status_code == 422
    )
    assert (
        client.post(
            "/api/compositions", json=dict(mode="scenario", source="x", count=31)
        ).status_code
        == 422
    )
    for _ in range(2):
        assert (
            client.post("/api/compositions", json=dict(mode="polish", source="x")).status_code
            == 202
        )
    assert client.post("/api/compositions", json=dict(mode="polish", source="x")).status_code == 429
    compositions.recover()
    assert {item["status"] for item in client.get("/api/compositions").json()} == {"interrupted"}


def test_study_elapsed_clamp_idempotence_and_consent(client, monkeypatch):
    material, job = completed_job(client, monkeypatch)
    session = client.post("/api/study/sessions", json=dict(job_id=job["id"])).json()["id"]
    with accounts.database() as db:
        db.execute("UPDATE study SET updated=? WHERE id=?", (time.time() - 12, session))
    event = dict(session_id=session, event_id=uuid.uuid4().hex, seconds=30, position=6)
    assert client.post("/api/study/events", json=event).status_code == 200
    assert client.post("/api/study/events", json=event).status_code == 200
    stats = client.get("/api/study/stats").json()
    assert 12 <= stats["total"] <= 13 and stats["streak"] == 1
    assert stats["leaderboard"] == []
    client.patch(
        "/api/auth/profile", json=dict(display_name="Synthetic", goal=300, leaderboard=True)
    )
    assert client.get("/api/study/stats").json()["leaderboard"][0]["display_name"] == "Synthetic"
    switch_user(client)
    assert client.get("/api/study/stats").json()["total"] == 0
    assert (
        client.post("/api/study/events", json={**event, "event_id": uuid.uuid4().hex}).status_code
        == 404
    )


def test_duplicate_tabs_cannot_double_time(client, monkeypatch):
    _, job = completed_job(client, monkeypatch)
    sessions = [
        client.post("/api/study/sessions", json=dict(job_id=job["id"])).json()["id"]
        for _ in range(2)
    ]
    with accounts.database() as db:
        db.execute("UPDATE study SET updated=?", (time.time() - 20,))
    for session in sessions:
        client.post(
            "/api/study/events",
            json=dict(session_id=session, event_id=uuid.uuid4().hex, seconds=20, position=5),
        )
    assert 20 <= client.get("/api/study/stats").json()["total"] <= 21


def test_dialogue_language_validation_and_sentence_offsets(client, monkeypatch, tmp_path):
    import numpy as np
    import soundfile as sf

    from app import engine, jobs

    voices = []

    def fake(text, voice, speed, pause, output, preview=False, progress=None):
        voices.append(voice)
        sf.write(output.with_suffix(".wav"), np.zeros(24000), 24000)
        return dict(segments=[dict(text=text, start=0, end=1)])

    monkeypatch.setattr(engine.engine, "generate", fake)
    monkeypatch.setattr(
        engine, "write_audio", lambda audio, output: output.write_bytes(b"ID3-dialogue-fixture")
    )
    monkeypatch.setattr(jobs.executor, "submit", lambda fn, identifier: fn(identifier))
    turns = [
        dict(speaker="A", text="Hello.", translation="你好"),
        dict(speaker="B", text="Good morning.", translation="早上好"),
    ]
    material = client.post(
        "/api/materials", json=dict(text="Ignored", turns=turns, role_a="Buyer", role_b="Seller")
    ).json()
    assert material["text"] == "Hello.\n\nGood morning."
    body = dict(
        text=material["text"],
        material_id=material["id"],
        voice="am_fenrir",
        voice_b="zf_xiaobei",
        pause=0.4,
    )
    assert client.post("/api/generations", json=body).status_code == 422
    body["voice_b"] = "af_heart"
    job = client.post("/api/generations", json=body).json()
    result = client.get("/api/generations/" + job["id"]).json()
    assert result["status"] == "completed"
    assert voices == ["am_fenrir", "af_heart"]
    assert result["segments"][1]["start"] == 1.4
    assert result["segments"][1]["role"] == "Seller"
    assert result["segments"][1]["translation"] == "早上好"


def test_completed_batches_survive_later_failure_and_restart(client, monkeypatch):
    monkeypatch.setattr(compositions, "providers", lambda: [dict(name="synthetic")])
    calls = []

    def model(provider, messages):
        calls.append(messages)
        if len(calls) > 1:
            raise URLError("Temporary outage")
        result = fake_result("scenario", 3)
        for index, dialogue in enumerate(result.dialogues):
            dialogue.turns[0].text += str(index)
        return result

    monkeypatch.setattr(compositions, "request_model", model)
    monkeypatch.setattr(compositions.executor, "submit", lambda fn, identifier: fn(identifier))
    job = client.post(
        "/api/compositions",
        json=dict(mode="scenario", source="Synthetic rehearsal", count=6, turns=4),
    ).json()
    item = client.get("/api/compositions/" + job["id"]).json()
    assert item["status"] == "failed" and len(item["result"]["dialogues"]) == 3
    assert "已完成的部分" in item["error"]
    item["status"] = "running"
    compositions.put(item)
    compositions.recover()
    restored = client.get("/api/compositions/" + job["id"]).json()
    assert restored["status"] == "interrupted" and len(restored["result"]["dialogues"]) == 3


def test_shared_material_does_not_disclose_another_learners_recordings(client, monkeypatch):
    material, _ = completed_job(client, monkeypatch)
    meta = dict(title="Shared text", tags=[], visibility="shared", favorite=False, archived=False)
    client.patch("/api/materials/" + material["id"], json=meta)
    switch_user(client)
    new_job = client.post(
        "/api/generations", json=dict(text=material["text"], material_id=material["id"])
    ).json()
    own_recording = client.get("/api/generations/" + new_job["id"]).json()
    assert own_recording["status"] == "completed"
    owner_login(client)
    assert client.get("/api/generations/" + new_job["id"]).status_code == 404
    assert client.get(own_recording["audio_url"]).status_code == 404
