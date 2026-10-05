import io
import re
import shutil
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import DATA, LANGUAGES, ROOT, VOICE_NAMES, VOICE_NOTES, ensure_dirs
from .engine import engine
from .jobs import recover_jobs, submit
from .storage import get_job, get_material, list_jobs, list_materials, save_material
from .text import clean_text


@asynccontextmanager
async def lifespan(app):
    ensure_dirs()
    recover_jobs()
    yield


app = FastAPI(title="Sayloop", version="0.1.0", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])


@app.middleware("http")
async def local_only(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin:
        parsed = urlparse(origin)
        if parsed.netloc != request.headers.get("host"):
            return JSONResponse({"detail": "Cross-origin writes are not allowed."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'"
    )
    return response


class MaterialInput(BaseModel):
    title: str = Field(default="Untitled material", max_length=160)
    text: str = Field(min_length=1, max_length=100_000)
    language: str = "a"

    @field_validator("language")
    @classmethod
    def language_exists(cls, value):
        if value not in LANGUAGES:
            raise ValueError("Unknown language")
        return value


class GenerationInput(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    title: str = Field(default="Untitled audio", max_length=160)
    voice: str = "am_fenrir"
    language: str = "a"
    speed: float = Field(default=1.0, ge=0.5, le=1.5)
    pause: float = Field(default=0.3, ge=0, le=2)
    kind: str = Field(default="full", pattern="^(full|preview)$")
    material_id: str | None = None


@app.get("/api/health")
def health():
    return dict(
        status="ok",
        model="Kokoro-82M",
        loaded=engine.model is not None,
        device=engine.device,
        ffmpeg=bool(shutil.which("ffmpeg")),
    )


@app.get("/api/voices")
def voices():
    return dict(
        languages=LANGUAGES,
        voices=[
            dict(
                id=v,
                name=v.split("_", 1)[1].title(),
                language=v[0],
                gender="male" if v[1] == "m" else "female",
                note=VOICE_NOTES.get(v, "Listen to find your fit"),
            )
            for v in VOICE_NAMES
        ],
    )


@app.get("/api/materials")
def materials():
    return list_materials()


@app.post("/api/materials", status_code=201)
def create_material(item: MaterialInput):
    try:
        return save_material(item.title, item.text, item.language)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post("/api/materials/upload", status_code=201)
async def upload(file: Annotated[UploadFile, File()], language: Annotated[str, Form()] = "a"):
    if language not in LANGUAGES:
        raise HTTPException(422, "Choose a supported language.")
    name = Path(file.filename or "Untitled.txt").name
    if Path(name).suffix.lower() not in (".txt", ".md"):
        raise HTTPException(422, "Upload a UTF-8 .txt or .md file.")
    raw = await file.read(400_001)
    if len(raw) > 400_000:
        raise HTTPException(413, "File is too large. Maximum: 400 KB.")
    try:
        text = raw.decode("utf-8-sig")
        if len(text) > 100_000:
            raise ValueError("Maximum: 100,000 characters per material.")
        return save_material(Path(name).stem, text, language, source=name)
    except (UnicodeError, ValueError) as error:
        raise HTTPException(422, f"Cannot import this file: {error}") from error


@app.post("/api/generations", status_code=202)
def generate(item: GenerationInput):
    if item.voice not in VOICE_NAMES or item.language != item.voice[0]:
        raise HTTPException(422, "Select a voice matching the text language.")
    text = clean_text(item.text)
    if not text:
        raise HTTPException(422, "Add some speakable text first.")
    if item.material_id:
        try:
            material = get_material(item.material_id)
        except (ValueError, FileNotFoundError):
            raise HTTPException(404, "Material not found.") from None
        if material["text"] != text:
            raise HTTPException(409, "Save the edited text as a new material version first.")
    try:
        return submit(
            text, item.title, item.voice, item.speed, item.pause, item.kind, item.material_id
        )
    except ValueError as error:
        raise HTTPException(429, str(error)) from error


@app.get("/api/generations")
def generations():
    return [{k: v for k, v in job.items() if k not in ("text", "segments")} for job in list_jobs()]


@app.get("/api/generations/{identifier}")
def generation(identifier: str):
    try:
        return get_job(identifier)
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, "Generation not found.") from None


@app.get("/api/audio/{filename}")
def audio(filename: str, download: bool = False):
    match = re.fullmatch(r"([a-f0-9]{32})\.(mp3|wav)", filename)
    if not match:
        raise HTTPException(404, "Audio not found.")
    job = generation(match[1])
    path = DATA / "audio" / filename
    if job["status"] != "completed" or not path.is_file():
        raise HTTPException(404, "Audio is not ready.")
    title = re.sub(r"[^\w .-]", "_", job["title"])[:100]
    return FileResponse(
        path,
        media_type="audio/mpeg" if match[2] == "mp3" else "audio/wav",
        filename=f"{title}-{job['voice']}.{match[2]}" if download else None,
    )


@app.get("/api/export")
def export(kind: str = "full"):
    if kind not in ("full", "preview"):
        raise HTTPException(422, "Unknown export type")
    selected = [j for j in list_jobs() if j["status"] == "completed" and j["kind"] == kind]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for i, job in enumerate(selected, 1):
            path = DATA / "audio" / f"{job['id']}.mp3"
            title = re.sub(r"[^\w .-]", "_", job["title"])[:100]
            name = f"{i:02d}-{title}-{job['voice']}"
            if path.is_file():
                archive.write(path, f"{name}.mp3")
                archive.writestr(f"{name}.txt", job["text"])
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="Sayloop-{kind}.zip"'},
    )


app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
