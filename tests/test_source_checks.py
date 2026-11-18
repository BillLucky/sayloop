"""Exercise real commits in fresh clones, including mismatched index/worktree content."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def git(root, *args, check=True):
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=check)


@pytest.fixture
def clone(tmp_path):
    seed = tmp_path / "seed"
    seed.mkdir()
    for name in (
        ".githooks/pre-commit",
        "scripts/check_staged.py",
        "scripts/privacy_check.py",
        "scripts/install_hooks.py",
        ".prettierrc.json",
        "requirements.lock",
        "pyproject.toml",
    ):
        target = seed / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, target)
    (seed / "package.json").write_text(json.dumps({"devDependencies": {"prettier": "3.5.3"}}))
    (seed / "web").mkdir()
    (seed / "web/sample.js").write_text("export const value = 1;\n")
    git(seed, "init", "-q")
    git(seed, "config", "user.name", "Synthetic check")
    git(seed, "config", "user.email", "checks@example.invalid")
    git(seed, "add", ".")
    git(seed, "commit", "-qm", "Seed isolated source fixture")
    working = tmp_path / "clone"
    git(tmp_path, "clone", "--quiet", str(seed), str(working))
    git(working, "config", "user.name", "Synthetic check")
    git(working, "config", "user.email", "checks@example.invalid")
    # Reuse locked tools, not a working tree's source/config or any personal data.
    (working / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    subprocess.run([sys.executable, "scripts/install_hooks.py"], cwd=working, check=True)
    return working


def test_commit_rejects_bad_index_even_when_worktree_is_formatted(clone):
    source = clone / "web/sample.js"
    source.write_text("export const value={a:1}\n")
    git(clone, "add", "web/sample.js")
    source.write_text("export const value = { a: 1 };\n")
    result = git(clone, "commit", "-m", "Must fail", check=False)
    assert result.returncode != 0
    assert "Commit blocked" in result.stdout + result.stderr


def test_commit_accepts_good_index_even_when_worktree_has_unstaged_errors(clone):
    source = clone / "web/sample.js"
    source.write_text("export const value = 2;\n")
    git(clone, "add", "web/sample.js")
    source.write_text("export const value={a:1}\n")
    git(clone, "commit", "-qm", "Good staged source")
    assert "value = 2" in git(clone, "show", "HEAD:web/sample.js").stdout
    assert git(clone, "diff").stdout


def test_commit_rejects_staged_private_text_without_echoing_it(clone):
    token = "ghp_" + "x" * 30
    (clone / "leak.txt").write_text(token)
    git(clone, "add", "leak.txt")
    (clone / "leak.txt").write_text("Clean working copy\n")
    result = git(clone, "commit", "-m", "Must fail", check=False)
    assert result.returncode != 0
    assert "credential" in result.stdout + result.stderr
    assert token not in result.stdout + result.stderr


def test_existing_hook_configuration_is_preserved(clone):
    git(clone, "config", "core.hooksPath", "custom-hooks")
    subprocess.run([sys.executable, "scripts/install_hooks.py"], cwd=clone, check=True)
    assert git(clone, "config", "--get", "core.hooksPath").stdout.strip() == "custom-hooks"
