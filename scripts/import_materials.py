"""Copy originals and import UTF-8 texts without changing source files."""

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA, ensure_dirs
from app.storage import list_materials, save_material

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
args = parser.parse_args()
ensure_dirs()
existing = {m["source"] for m in list_materials()}
for path in sorted(args.directory.glob("*")):
    if path.suffix.lower() not in (".txt", ".md"):
        continue
    target = DATA / "originals" / path.name
    if path.resolve() != target.resolve():
        if target.exists() and target.read_bytes() != path.read_bytes():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()[:8]
            target = target.with_name(f"{path.stem}-{digest}{path.suffix}")
        if not target.exists():
            shutil.copy2(path, target)
    if path.name in existing:
        print(f"Already imported: {path.name}")
        continue
    if not path.read_text().strip():
        print(f"Skipped empty file: {path.name}")
        continue
    item = save_material(path.stem, path.read_text(encoding="utf-8-sig"), source=path.name)
    print(f"Imported {item['id']}: {item['words']} words")
