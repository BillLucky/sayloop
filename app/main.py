import io
import re
import shutil
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import accounts, compositions
from .compositions import Turn
from .config import DATA, LANGUAGES, ROOT, VERSION, VOICE_NAMES, VOICE_NOTES, ensure_dirs
from .engine import engine
from .jobs import recover_jobs, submit
from .learning import router
from .network import settings
from .storage import (
    IDENTIFIER_PATTERN,
    RequestConflict,
    get_job,
    get_material,
    list_jobs,
    list_materials,
    save_material,
)
from .text import clean_text


@asynccontextmanager
async def lifespan(app):
    ensure_dirs()
    accounts.initialize()
    compositions.recover()
    recover_jobs()
    yield


app = FastAPI(title="Sayloop", version=VERSION, lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings()["allowed_hosts"])


@app.middleware("http")
async def local_only(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin:
        parsed = urlparse(origin)
        if parsed.netloc != request.headers.get("host"):
            return JSONResponse({"detail": "Cross-origin writes are not allowed."}, status_code=403)
    request.state.user = accounts.current_user(request.cookies.get(accounts.COOKIE))
    public = {
        "/api/health",
        "/api/voices",
        "/api/auth/me",
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/logout",
    }
    if (
        request.url.path.startswith("/api/")
        and request.url.path not in public
        and not request.state.user
    ):
        response = JSONResponse({"detail": "请先登录。"}, status_code=401)
    else:
        response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; "
        "frame-ancestors 'none'; form-action 'none'"
    )
    if "cache-control" not in response.headers:
        response.headers["Cache-Control"] = (
            "no-store" if request.url.path.startswith("/api/") else "no-cache"
        )
    return response


class MaterialInput(BaseModel):
    title: str = Field(default="Untitled material", max_length=160)
    text: str = Field(min_length=1, max_length=100_000)
    language: str = "a"
    tags: list[str] = Field(default_factory=list, max_length=12)
    turns: list[Turn] = Field(default_factory=list, max_length=100)
    role_a: str = Field(default="A", max_length=80)
    role_b: str = Field(default="B", max_length=80)
    composition_id: str | None = None
    reuse: bool = False

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
    voice_b: str | None = None
    request_id: str | None = Field(default=None, pattern=IDENTIFIER_PATTERN)


@app.get("/api/health")
def health():
    return dict(
        status="ok",
        version=VERSION,
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
                note=VOICE_NOTES.get(v, "先用短句试听，再选择适合的声音"),
            )
            for v in VOICE_NAMES
        ],
    )


@app.get("/api/materials")
def materials(request: Request, q: str = "", language: str = "", tag: str = ""):
    return [
        dict(item, owned=accounts.owner_id(item) == request.state.user["id"])
        for item in list_materials()
        if accounts.can_read(item, request.state.user)
        and (
            not q
            or q.casefold()
            in (
                item["title"] + " " + item["text"] + " " + " ".join(item.get("tags", []))
            ).casefold()
        )
        and (not language or item["language"] == language)
        and (not tag or tag in item.get("tags", []))
    ]


@app.post("/api/materials", status_code=201)
def create_material(item: MaterialInput, request: Request):
    try:
        if item.composition_id:
            from .learning import get_composition

            get_composition(item.composition_id, request)
        text = "\n\n".join(turn.text for turn in item.turns) if item.turns else item.text
        return save_material(
            item.title,
            text,
            item.language,
            owner_id=request.state.user["id"],
            visibility="private",
            tags=[tag[:40] for tag in item.tags],
            turns=[turn.model_dump() for turn in item.turns],
            role_a=item.role_a,
            role_b=item.role_b,
            composition_id=item.composition_id,
            reuse=item.reuse,
        )
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.post("/api/materials/upload", status_code=201)
async def upload(
    request: Request, file: Annotated[UploadFile, File()], language: Annotated[str, Form()] = "a"
):
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
        return save_material(
            Path(name).stem,
            text,
            language,
            source=name,
            owner_id=request.state.user["id"],
            visibility="private",
        )
    except (UnicodeError, ValueError) as error:
        raise HTTPException(422, f"Cannot import this file: {error}") from error


@app.post("/api/generations", status_code=202)
def generate(item: GenerationInput, request: Request):
    if item.voice not in VOICE_NAMES or item.language != item.voice[0]:
        raise HTTPException(422, "Select a voice matching the text language.")
    if item.voice_b and (item.voice_b not in VOICE_NAMES or item.voice_b[0] != item.language):
        raise HTTPException(422, "角色 B 的声音必须与语料语言一致。")
    text = clean_text(item.text)
    if not text:
        raise HTTPException(422, "Add some speakable text first.")
    material = None
    if item.material_id:
        try:
            material = get_material(item.material_id)
            accounts.require_read(material, request.state.user)
        except (ValueError, FileNotFoundError):
            raise HTTPException(404, "Material not found.") from None
        if material["text"] != text:
            raise HTTPException(409, "Save the edited text as a new material version first.")
    try:
        accepted = submit(
            text,
            item.title,
            item.voice,
            item.speed,
            item.pause,
            item.kind,
            item.material_id,
            owner_id=request.state.user["id"],
            turns=material.get("turns", []) if material else [],
            voice_b=item.voice_b or item.voice,
            role_a=material.get("role_a", "A") if material else "A",
            role_b=material.get("role_b", "B") if material else "B",
            request_id=item.request_id,
        )
        return dict(audio_versions(accepted), owned=True)
    except RequestConflict as error:
        raise HTTPException(409, str(error)) from error
    except ValueError as error:
        raise HTTPException(429, str(error)) from error


def audio_version(path):
    stat = path.stat()
    # Do not reuse pre-account immutable HTTP-cache entries after the privacy migration.
    return f"account-v1-{stat.st_mtime_ns:x}-{stat.st_size:x}"


def audio_versions(job):
    job = {key: value for key, value in job.items() if key != "request_id"}
    if job["status"] == "completed":
        for extension, key in (("mp3", "audio_url"), ("wav", "wav_url")):
            path = DATA / "audio" / f"{job['id']}.{extension}"
            if path.is_file():
                job[key] = f"/api/audio/{path.name}?v={audio_version(path)}"
    return job


@app.get("/api/generations")
def generations(request: Request):
    return [
        {
            k: v
            for k, v in dict(
                audio_versions(job), owned=accounts.owner_id(job) == request.state.user["id"]
            ).items()
            if k not in ("text", "segments", "turns")
        }
        for job in list_jobs()
        if accounts.can_read(job, request.state.user)
    ]


@app.get("/api/generations/{identifier}")
def generation(identifier: str, request: Request):
    try:
        job = audio_versions(accounts.require_read(get_job(identifier), request.state.user))
        job["owned"] = accounts.owner_id(job) == request.state.user["id"]
        job["resume_position"] = accounts.resume_position(request.state.user, job)
        return job
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, "Generation not found.") from None


@app.get("/api/audio/{filename}")
def audio(filename: str, request: Request, download: bool = False, v: str = ""):
    match = re.fullmatch(r"([a-f0-9]{32})\.(mp3|wav)", filename)
    if not match:
        raise HTTPException(404, "Audio not found.")
    job = generation(match[1], request)
    path = DATA / "audio" / filename
    if job["status"] != "completed" or not path.is_file():
        raise HTTPException(404, "Audio is not ready.")
    version = audio_version(path)
    if v and v != version:
        raise HTTPException(410, "Recording changed. Refresh the library.")
    headers = {
        # Revalidate authorization before browser HTTP-cache reuse, including account switches.
        "Cache-Control": "private, no-cache",
        "ETag": f'"{version}"',
        "Vary": "Cookie",
    }
    if request.headers.get("if-none-match") in (headers["ETag"], "*"):
        return Response(status_code=304, headers=headers)
    title = re.sub(r"[^\w .-]", "_", job["title"])[:100]
    return FileResponse(
        path,
        headers=headers,
        media_type="audio/mpeg" if match[2] == "mp3" else "audio/wav",
        filename=f"{title}-{job['voice']}.{match[2]}" if download else None,
    )


@app.get("/api/export")
def export(request: Request, kind: str = "full"):
    if kind not in ("full", "preview"):
        raise HTTPException(422, "Unknown export type")
    selected = [
        j
        for j in list_jobs()
        if j["status"] == "completed"
        and j["kind"] == kind
        and accounts.can_read(j, request.state.user)
    ]
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


app.include_router(router)
app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
