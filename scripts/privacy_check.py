"""Audit staged source, optionally all reachable Git history; never inspect local data."""

import argparse
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Only these manually reviewed screenshots use synthetic browser-test fixtures.
REVIEWED_IMAGES = {
    "docs/images/library.jpg",
    "docs/images/studio.jpg",
    "docs/images/practice.jpg",
    "docs/images/mobile.jpg",
}
BLOCKED = {
    ".mp3",
    ".wav",
    ".ogg",
    ".flac",
    ".mp4",
    ".pth",
    ".pt",
    ".safetensors",
    ".log",
    ".zip",
    ".gz",
    ".jpg",
    ".jpeg",
    ".png",
    ".sqlite",
    ".db",
}
PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:ghp_|gho_|hf_)[A-Za-z0-9]{25,}\b"),
    re.compile(r"/Users/[A-Za-z0-9._-]+/"),
    re.compile(r"\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net\b", re.IGNORECASE),
]


def artifact(name):
    path = Path(name)
    return (
        path.parts[0] in {"data", ".venv", "node_modules", ".claude"}
        or (path.name.startswith(".env") and path.name != ".env.example")
        or (path.suffix.lower() in BLOCKED and name not in REVIEWED_IMAGES)
    )


def inspect(name, content):
    if artifact(name):
        return "private/generated artifact"
    if any(pattern.search(content) for pattern in PATTERNS):
        return "credential, personal home path, or private tailnet hostname pattern"
    return None


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true", help="Also scan all branches and tags")
    args = parser.parse_args()
    entries = []
    for entry in git("ls-files", "--stage", "-z").decode().split("\0"):
        if entry:
            info, name = entry.split("\t", 1)
            entries.append((name, info.split()[1]))
    if args.history:
        for commit in git("rev-list", "--all").decode().splitlines():
            for entry in git("ls-tree", "-r", "-z", commit).decode().split("\0"):
                if entry:
                    info, name = entry.split("\t", 1)
                    if info.split()[1] == "blob":
                        entries.append((name, info.split()[2]))
    findings = []
    checked = set()
    for name, blob in entries:
        if (name, blob) in checked:
            continue
        checked.add((name, blob))
        issue = inspect(name, git("cat-file", "blob", blob).decode(errors="replace"))
        if issue:
            findings.append(f"{name} ({blob[:8]}): {issue}")
    if findings:
        raise SystemExit("\n".join(findings))
    print(f"Privacy check passed: {len(checked)} source revisions; no detected private artifacts.")


if __name__ == "__main__":
    main()
