"""Authenticated authoring, account settings, and learning APIs."""

import time
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from . import accounts, compositions, storage

router = APIRouter(prefix="/api")


class Login(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=1, max_length=200)


class Registration(Login):
    password: str = Field(min_length=10, max_length=200)
    display_name: str = Field(min_length=1, max_length=40)
    invite_code: str = Field(min_length=1, max_length=100)


class Profile(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    display_name: str = Field(min_length=1, max_length=40)
    goal: int = Field(ge=60, le=10800)
    leaderboard: bool


class Password(BaseModel):
    current: str = Field(min_length=1, max_length=200)
    new: str = Field(min_length=10, max_length=200)


@router.get("/auth/me")
def me(request: Request):
    return dict(user=request.state.user)


@router.post("/auth/login")
def login(item: Login, request: Request, response: Response):
    token, user = accounts.login(item.username, item.password, request.client.host)
    response.set_cookie(
        accounts.COOKIE,
        token,
        max_age=accounts.SESSION_SECONDS,
        httponly=True,
        samesite="strict",
        secure=request.url.scheme == "https",
    )
    return dict(user=user)


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    accounts.logout(request.cookies.get(accounts.COOKIE, ""))
    response.delete_cookie(accounts.COOKIE)
    return dict(ok=True)


@router.post("/auth/register", status_code=201)
def register(item: Registration):
    accounts.register(
        item.username, item.display_name.strip() or item.username, item.password, item.invite_code
    )
    return dict(ok=True)


@router.post("/auth/invite")
def invite(request: Request):
    if not request.state.user["admin"]:
        raise HTTPException(403, "只有管理员可以邀请用户。")
    return dict(code=accounts.invite(), expires_in=86400)


@router.patch("/auth/profile")
def profile(item: Profile, request: Request):
    with accounts.database() as db:
        db.execute(
            "UPDATE users SET display_name=?,goal=?,leaderboard=? WHERE id=?",
            (item.display_name, item.goal, item.leaderboard, request.state.user["id"]),
        )
    return dict(ok=True)


@router.post("/auth/password")
def password(item: Password, request: Request):
    with accounts.database() as db:
        row = db.execute(
            "SELECT password FROM users WHERE id=?", (request.state.user["id"],)
        ).fetchone()
        if not accounts.password_matches(item.current, row[0]):
            raise HTTPException(403, "当前密码不正确。")
        db.execute(
            "UPDATE users SET password=? WHERE id=?",
            (accounts.password_hash(item.new), request.state.user["id"]),
        )
        db.execute("DELETE FROM sessions WHERE user_id=?", (request.state.user["id"],))
    return dict(ok=True)


@router.get("/authoring/options")
def options():
    return compositions.catalog()


@router.get("/compositions")
def list_compositions(request: Request):
    return [
        {k: v for k, v in item.items() if k not in ("result", "partial_result")}
        for item in compositions.list_compositions(request.state.user["id"])
    ]


@router.get("/compositions/{identifier}")
def get_composition(identifier: str, request: Request):
    try:
        item = compositions.get_composition(identifier)
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, "创作版本不存在。") from None
    if item["owner_id"] != request.state.user["id"]:
        raise HTTPException(404, "创作版本不存在。")
    return {key: value for key, value in item.items() if key != "partial_result"}


@router.post("/compositions", status_code=202)
def create_composition(item: compositions.CompositionInput, request: Request):
    if item.parent_id:
        get_composition(item.parent_id, request)
    try:
        accepted = compositions.submit(item, request.state.user["id"])
        return {key: value for key, value in accepted.items() if key != "partial_result"}
    except compositions.RequestConflict as error:
        raise HTTPException(409, str(error)) from error
    except ValueError as error:
        raise HTTPException(429, str(error)) from error


class Metadata(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=160)
    tags: list[str] = Field(default_factory=list, max_length=12)
    visibility: Literal["private", "shared"] = "private"
    favorite: bool = False
    archived: bool = False


@router.patch("/materials/{identifier}")
def material_metadata(identifier: str, item: Metadata, request: Request):
    try:
        material = storage.get_material(identifier)
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, "语料不存在。") from None
    if accounts.owner_id(material) != request.state.user["id"]:
        raise HTTPException(404, "语料不存在。")
    material.update(item.model_dump(), tags=[tag[:40] for tag in item.tags if tag])
    storage.write_json(storage.DATA / "materials" / f"{identifier}.json", material)
    return material


class StudyStart(BaseModel):
    job_id: str


@router.post("/study/sessions", status_code=201)
def study_start(item: StudyStart, request: Request):
    try:
        job = storage.get_job(item.job_id)
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, "录音不存在。") from None
    accounts.require_read(job, request.state.user)
    if job["status"] != "completed":
        raise HTTPException(409, "录音尚未完成。")
    identifier = uuid.uuid4().hex
    stamp = time.time()
    with accounts.database() as db:
        db.execute(
            "INSERT INTO study(id,user_id,job_id,opened,updated) VALUES(?,?,?,?,?)",
            (identifier, request.state.user["id"], item.job_id, stamp, stamp),
        )
    return dict(id=identifier)


class StudyEvent(BaseModel):
    session_id: str = Field(pattern="^[a-f0-9]{32}$")
    event_id: str = Field(pattern="^[a-f0-9]{32}$")
    seconds: int = Field(ge=0, le=30)
    position: float = Field(ge=0, le=1000000, allow_inf_nan=False)


@router.post("/study/events")
def study_event(item: StudyEvent, request: Request):
    accounts.record_event(
        request.state.user, item.session_id, item.event_id, item.seconds, item.position
    )
    return dict(ok=True)


@router.get("/study/stats")
def stats(request: Request):
    return accounts.statistics(request.state.user)


class Feedback(BaseModel):
    target_type: Literal["material", "generation", "composition"]
    target_id: str
    rating: int = Field(ge=1, le=5)
    note: str = Field(default="", max_length=2000)


@router.post("/feedback", status_code=201)
def feedback(item: Feedback, request: Request):
    try:
        if item.target_type == "composition":
            target = get_composition(item.target_id, request)
        elif item.target_type == "generation":
            target = storage.get_job(item.target_id)
        else:
            target = storage.get_material(item.target_id)
        accounts.require_read(target, request.state.user)
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, "反馈对象不存在。") from None
    with accounts.database() as db:
        db.execute(
            "INSERT INTO feedback VALUES(?,?,?,?,?,?,?)",
            (
                uuid.uuid4().hex,
                request.state.user["id"],
                item.target_type,
                item.target_id,
                item.rating,
                item.note,
                time.time(),
            ),
        )
    return dict(ok=True)


@router.get("/feedback")
def list_feedback(request: Request):
    with accounts.database() as db:
        return [
            dict(row)
            for row in db.execute(
                "SELECT target_type,target_id,rating,note,created FROM feedback WHERE user_id=? ORDER BY created DESC LIMIT 50",
                (request.state.user["id"],),
            )
        ]
