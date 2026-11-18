"""Audit staged source, optionally all reachable Git history; never inspect local data."""

import argparse
import ipaddress
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
# Synthetic captures reviewed for v0.2 and v0.4.1. A familiar filename alone is not approval.
REVIEWED_IMAGE_BLOBS = {
    "docs/images/library.jpg": {
        "0b0e63bfe8abb63e62e77ae1bb05ad6c39dd670e",
        "47e954c2c76473877246eb051adb95661391f646",
    },
    "docs/images/mobile.jpg": {
        "bfeaacc3b21e36f86cfa1fddb999a521c70c5154",
        "efff4ab9280078366ec5a3342e760ca98c1fecf4",
    },
    "docs/images/practice.jpg": {
        "0f780dbd61ea5cace731b077865e6a5b40ec57e9",
        "2ca07edf78ad2b24837219334c8ac4d2f1a5484f",
    },
    "docs/images/studio.jpg": {
        "693bad5f7009dc85b155a929ad5fa6bfe3d98baf",
        "c08b23c79bf260797b42c99d9b35e31e4b25a166",
    },
}
# These immutable old test revisions contain fabricated addresses, not deployment settings.
REVIEWED_NETWORK_FIXTURES = {
    ("tests/test_network.py", "8c9e9a34c6b1ca68e3fe3e911f8c1971bcac3313"),
    ("tests/test_network.py", "99b3d0696912dc9c171490463c59f6e9426171ba"),
}
PUBLIC_PROTOCOL_RANGES = (
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "100.64.0.0/10",
    "fc00::/7",
)
PRIVATE_NETWORKS = tuple(
    ipaddress.ip_network(value) for value in PUBLIC_PROTOCOL_RANGES if ":" not in value
)
PRIVATE_IPV6 = ipaddress.ip_network("fc00::/7")
IPV4 = re.compile(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])")
IPV6 = re.compile(r"(?<![\w:])[a-fA-F0-9]*:[a-fA-F0-9:]+(?![\w:])")
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
    ".sqlite3",
    ".db",
    ".har",
    ".pem",
    ".key",
}
PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:ghp_|gho_|hf_|github_pat_)[A-Za-z0-9_]{25,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"/Users/[A-Za-z0-9._-]+/"),
    re.compile(r"\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net\b", re.IGNORECASE),
    re.compile(r"(?<![.\w-])[a-z0-9][a-z0-9-]+\.local\b", re.IGNORECASE),
    re.compile(r"\bAKIA[A-Z0-9]{16}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
]


def artifact(name):
    path = Path(name)
    return (
        path.parts[0]
        in {"data", "_local", ".venv", "node_modules", ".claude", ".codex", ".taste-skill"}
        or path.parts[:2] == ("docs", "private")
        or path.name
        in {"OWNER_LOGIN.txt", "llm.json", "network.json", "accounts.sqlite3-journal", ".netrc"}
        or (path.name.startswith(".env") and path.name != ".env.example")
        or (path.suffix.lower() in BLOCKED and name not in REVIEWED_IMAGES)
    )


def private_address(content):
    """Allow public protocol constants and documentation IPs, never deployment addresses."""
    for network in PUBLIC_PROTOCOL_RANGES:
        content = content.replace(f'"{network}"', "").replace(f"'{network}'", "")
    for pattern in (IPV4, IPV6):
        for match in pattern.finditer(content):
            try:
                address = ipaddress.ip_address(match.group())
            except ValueError:
                continue
            if address.version == 4 and any(address in network for network in PRIVATE_NETWORKS):
                return True
            if address.version == 6 and address in PRIVATE_IPV6:
                return True
    return False


def inspect(name, content, blob=None):
    if artifact(name):
        return "private/generated artifact"
    if any(pattern.search(content) for pattern in PATTERNS):
        return "credential, personal home path, or private tailnet hostname pattern"
    if name in REVIEWED_IMAGES and blob not in REVIEWED_IMAGE_BLOBS[name]:
        return "image revision has not been reviewed as synthetic"
    if (name, blob) not in REVIEWED_NETWORK_FIXTURES and private_address(content):
        return "private LAN, tailnet, or IPv6 address"
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
        issue = inspect(name, git("cat-file", "blob", blob).decode(errors="replace"), blob)
        if issue:
            findings.append(f"{name} ({blob[:8]}): {issue}")
    if findings:
        raise SystemExit("\n".join(findings))
    print(f"Privacy check passed: {len(checked)} source revisions; no detected private artifacts.")


if __name__ == "__main__":
    main()
