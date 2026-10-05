"""Inspect Git-tracked files; never scan or upload the local personal data directory."""

import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
files = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
blocked = {".mp3", ".wav", ".pth", ".pt", ".safetensors", ".log", ".zip", ".jpg", ".png"}
patterns = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:ghp_|gho_|hf_)[A-Za-z0-9]{25,}\b"),
    re.compile(r"/Users/[A-Za-z0-9._-]+/"),
]
findings = []
for name in filter(None, files):
    p = Path(name)
    if (
        p.parts[0] in {"data", ".venv", "node_modules", ".claude"}
        or p.name == ".env"
        or p.suffix in blocked
    ):
        findings.append(f"{name}: private/generated artifact is tracked")
        continue
    text = (root / p).read_text(errors="replace")
    if any(pattern.search(text) for pattern in patterns):
        findings.append(f"{name}: credential or personal home path pattern")
if findings:
    raise SystemExit("\n".join(findings))
print(
    f"Privacy check passed: {len(list(filter(None, files)))} tracked source files; no personal data artifacts."
)
