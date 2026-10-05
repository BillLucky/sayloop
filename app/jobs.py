import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

from .config import DATA
from .engine import engine
from .storage import get_job, list_jobs, now, put_job

executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="kokoro")
submit_lock = threading.Lock()


def recover_jobs():
    for job in list_jobs():
        if job["status"] in ("queued", "running"):
            job.update(
                status="interrupted", error="The server restarted. Use Retry to generate again."
            )
            put_job(job)


def run_job(identifier):
    job = get_job(identifier)
    job.update(status="running", progress=1)
    put_job(job)
    try:

        def progress(value):
            job["progress"] = value
            put_job(job)

        output = DATA / "audio" / f"{identifier}.mp3"
        result = engine.generate(
            job["text"],
            job["voice"],
            job["speed"],
            job["pause"],
            output,
            preview=job["kind"] == "preview",
            progress=progress,
        )
        job.update(
            result,
            status="completed",
            progress=100,
            completed_at=now(),
            audio_url=f"/api/audio/{identifier}.mp3",
            wav_url=f"/api/audio/{identifier}.wav",
        )
    except Exception as error:
        logging.exception("Speech job %s failed", identifier)
        job.update(status="failed", error=f"{type(error).__name__}: {error}")
    put_job(job)


def submit(text, title, voice, speed=1.0, pause=0.3, kind="full", material_id=None):
    with submit_lock:
        active = sum(j["status"] in ("queued", "running") for j in list_jobs())
        if active >= 20:
            raise ValueError("The queue is full. Wait for a generation to finish.")
        job = dict(
            id=uuid.uuid4().hex,
            text=text,
            title=title,
            voice=voice,
            speed=speed,
            pause=pause,
            kind=kind,
            material_id=material_id,
            status="queued",
            progress=0,
            created_at=now(),
        )
        put_job(job)
        executor.submit(run_job, job["id"])
        return job
