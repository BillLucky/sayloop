"""Generate nine voice previews and a full recording for each imported material."""

import argparse
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA, VOICE_NAMES, ensure_dirs
from app.engine import engine
from app.storage import list_jobs, list_materials, now, put_job

parser = argparse.ArgumentParser()
parser.add_argument("--voice", default="am_fenrir", choices=VOICE_NAMES)
parser.add_argument("--only", choices=["preview", "full", "all"], default="all")
args = parser.parse_args()
ensure_dirs()
materials = sorted(list_materials(), key=lambda x: x["title"])
if not materials:
    raise SystemExit("Import your materials first.")
tasks = []
if args.only != "full":
    for voice in VOICE_NAMES:
        if voice.startswith("am_"):
            tasks.append((materials[0], voice, "preview"))
if args.only != "preview":
    tasks.extend((m, args.voice, "full") for m in materials)
for material, voice, kind in tasks:
    existing = [
        j
        for j in list_jobs()
        if j["status"] == "completed"
        and j["kind"] == kind
        and j["voice"] == voice
        and j.get("material_id") == material["id"]
        and j["text"] == material["text"]
    ]
    if existing:
        print(f"Cached: {kind} {voice} {material['title']}", flush=True)
        continue
    identifier = uuid.uuid4().hex
    job = dict(
        id=identifier,
        title=material["title"],
        text=material["text"],
        voice=voice,
        speed=0.95,
        pause=0.3,
        kind=kind,
        material_id=material["id"],
        created_at=now(),
        status="running",
        progress=1,
    )
    put_job(job)
    print(f"Generating: {kind} {voice} {material['title']}", flush=True)

    def progress(value, current_job=job):
        current_job["progress"] = value
        put_job(current_job)

    try:
        result = engine.generate(
            material["text"],
            voice,
            0.95,
            0.3,
            DATA / "audio" / f"{identifier}.mp3",
            kind == "preview",
            progress,
        )
        job.update(
            result,
            status="completed",
            progress=100,
            completed_at=now(),
            audio_url=f"/api/audio/{identifier}.mp3",
            wav_url=f"/api/audio/{identifier}.wav",
        )
        print(f"Completed: {result['duration']}s audio in {result['elapsed']}s", flush=True)
    except Exception as error:
        job.update(status="failed", error=str(error))
        put_job(job)
        raise
    put_job(job)
