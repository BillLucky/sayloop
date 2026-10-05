"""Back up existing full recordings, then regenerate them with sentence timestamps."""

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA
from app.engine import engine
from app.storage import list_jobs, put_job

for job in list_jobs():
    if job["status"] != "completed" or job["kind"] != "full" or job.get("timing_version", 1) >= 2:
        continue
    identifier = job["id"]
    backup = DATA / "backups" / "timing-v1" / identifier
    backup.mkdir(parents=True, exist_ok=True)
    for source in [
        DATA / "jobs" / f"{identifier}.json",
        DATA / "audio" / f"{identifier}.mp3",
        DATA / "audio" / f"{identifier}.wav",
    ]:
        if not (backup / source.name).exists():
            shutil.copy2(source, backup / source.name)
    target = DATA / "upgrades" / f"{identifier}.mp3"
    print(f"Upgrading {job['title']}", flush=True)
    result = engine.generate(job["text"], job["voice"], job["speed"], job["pause"], target)
    for ext in [".mp3", ".wav"]:
        target.with_suffix(ext).replace(DATA / "audio" / f"{identifier}{ext}")
    job.update(result)
    put_job(job)
    print(f"Saved {len(result['segments'])} sentences, {result['duration']} seconds", flush=True)
