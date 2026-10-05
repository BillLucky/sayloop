"""Package only committed source. Audio, credentials and model weights cannot enter this archive."""

import hashlib
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
subprocess.run(["git", "diff", "--exit-code", "HEAD"], cwd=root, check=True)
subprocess.run(["python3", "scripts/privacy_check.py"], cwd=root, check=True)
version = subprocess.check_output(
    ["git", "describe", "--tags", "--always"], cwd=root, text=True
).strip()
directory = root / "data" / "releases"
directory.mkdir(parents=True, exist_ok=True)
target = directory / f"sayloop-{version}.tar.gz"
subprocess.run(
    ["git", "archive", "--format=tar.gz", "--prefix=sayloop/", "-o", str(target), "HEAD"],
    cwd=root,
    check=True,
)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix(target.suffix + ".sha256").write_text(f"{digest}  {target.name}\n")
print(target)
