"""Install repository-local checks without replacing another hook configuration."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def install(root=ROOT):
    if subprocess.run(
        ["git", "rev-parse", "--git-dir"], cwd=root, capture_output=True, check=False
    ).returncode:
        print("Source archive: Git hooks are not needed.")
        return
    configured = subprocess.run(
        ["git", "config", "--get", "core.hooksPath"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    if configured and configured != ".githooks":
        print("Existing hooksPath preserved. Add scripts/check_staged.py to your pre-commit hook.")
        return
    if not configured:
        existing = subprocess.check_output(
            ["git", "rev-parse", "--git-path", "hooks/pre-commit"], cwd=root, text=True
        ).strip()
        if (root / existing).exists():
            print("Existing pre-commit preserved. Add scripts/check_staged.py to that hook.")
            return
    subprocess.run(
        ["git", "config", "--local", "core.hooksPath", ".githooks"], cwd=root, check=True
    )
    print("Repository hooks enabled: staged source, formatting, and privacy checks.")


if __name__ == "__main__":
    install()
