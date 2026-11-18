"""Check the index snapshot, independent of unstaged edits; --all is the CI contract."""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def run(command, cwd=ROOT):
    subprocess.run(command, cwd=cwd, check=True)


def ruff_command():
    local = ROOT / ".venv" / "bin" / "ruff"
    executable = str(local) if local.exists() else shutil.which("ruff")
    if not executable:
        raise ValueError("Install the locked development dependencies before committing Python.")
    return executable


def check(all_files=False):
    names = (
        git("ls-files", "-z")
        if all_files
        else git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
    )
    changed = [name for name in names.decode().split("\0") if name]
    run([sys.executable, str(ROOT / "scripts/privacy_check.py"), "--history"])
    if not changed:
        return
    # checkout-index reads staged blobs and config. No user's data or browser state is copied.
    with tempfile.TemporaryDirectory(prefix="sayloop-index-") as temporary:
        snapshot = Path(temporary)
        run(["git", "checkout-index", "--all", f"--prefix={snapshot}/"])
        python = [name for name in changed if name.endswith(".py")]
        if python:
            ruff = ruff_command()
            expected = next(
                line.removeprefix("ruff==")
                for line in (snapshot / "requirements.lock").read_text().splitlines()
                if line.startswith("ruff==")
            )
            installed = subprocess.check_output([ruff, "--version"], text=True).strip().split()[-1]
            if installed != expected:
                raise ValueError("Ruff version differs from the staged requirements.lock.")
            run([ruff, "check", *python], snapshot)
            run([ruff, "format", "--check", *python], snapshot)
        web = [
            name
            for name in changed
            if name.startswith("web/") and Path(name).suffix in {".js", ".css", ".html"}
        ]
        if web:
            prettier = ROOT / "node_modules/prettier/bin/prettier.cjs"
            if not prettier.exists():
                raise ValueError("Run npm ci --ignore-scripts before committing browser changes.")
            expected = json.loads((snapshot / "package.json").read_text())["devDependencies"][
                "prettier"
            ]
            installed = subprocess.check_output(["node", str(prettier), "--version"], text=True)
            if installed.strip() != expected:
                raise ValueError("Prettier version differs from the staged package.json.")
            run(["node", str(prettier), "--check", *web], snapshot)
            for name in web:
                if name.endswith(".js"):
                    run(["node", "--check", name], snapshot)
    print("Source checks passed for the Git index snapshot.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Check all tracked index files in CI")
    args = parser.parse_args()
    try:
        check(args.all)
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f"Commit blocked: {error}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
