"""Create human-readable local exports, preserving the app's canonical audio files."""

import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA, VERSION
from app.storage import list_jobs

root = DATA / "exports" / f"Sayloop-v{VERSION}"
root.mkdir(parents=True, exist_ok=True)
manifest = []
for job in reversed(list_jobs()):
    if job["status"] != "completed":
        continue
    directory = root / ("US-male-previews" if job["kind"] == "preview" else "Full-articles")
    directory.mkdir(parents=True, exist_ok=True)
    name = job["voice"] if job["kind"] == "preview" else f"{job['title']}--{job['voice']}"
    name = re.sub(r"[/\\\x00]", "_", name)
    target = directory / f"{name}.mp3"
    if target.exists():
        # Keep distinct generations; never overwrite an existing user's export.
        source = DATA / "audio" / f"{job['id']}.mp3"
        if target.read_bytes() != source.read_bytes():
            target = directory / f"{name}--{job['id'][:8]}.mp3"
    if not target.exists():
        shutil.copy2(DATA / "audio" / f"{job['id']}.mp3", target)
    target.with_suffix(".txt").write_text(job["text"], encoding="utf-8")
    manifest.append(
        dict(
            file=str(target.relative_to(root)),
            voice=job["voice"],
            duration=job["duration"],
            title=job["title"],
            kind=job["kind"],
            id=job["id"],
        )
    )
(root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
with zipfile.ZipFile(
    root / "Sayloop-audio-pack.zip", "w", compression=zipfile.ZIP_STORED
) as archive:
    archive.write(root / "manifest.json", "manifest.json")
    for item in manifest:
        path = root / item["file"]
        archive.write(path, path.relative_to(root))
        archive.write(path.with_suffix(".txt"), path.with_suffix(".txt").relative_to(root))
print(f"Exported {len(manifest)} recordings to {root}")
