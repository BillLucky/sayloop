"""Start the loopback-only server; --background leaves it running after the shell exits."""

import argparse
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.config import DATA, ensure_dirs

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8765)
parser.add_argument("--background", action="store_true")
args = parser.parse_args()
ensure_dirs()
url = f"http://127.0.0.1:{args.port}"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
try:
    with opener.open(url + "/api/health", timeout=2) as response:
        print(f"Server already responding: {url}")
        sys.exit(0)
except Exception:
    pass
command = [
    sys.executable,
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    str(args.port),
]
if args.background:
    with (DATA / "logs" / "server.log").open("a") as log:
        process = subprocess.Popen(
            command, cwd=ROOT, stdout=log, stderr=log, start_new_session=True
        )
    (DATA / "server.pid").write_text(str(process.pid))
    for _ in range(50):
        if process.poll() is not None:
            raise SystemExit(f"Server failed to start. Read {DATA / 'logs/server.log'}")
        try:
            with opener.open(url + "/api/health", timeout=1):
                print(f"Ready: {url} (PID {process.pid}). Log: {DATA / 'logs/server.log'}")
                break
        except OSError:
            time.sleep(0.2)
    else:
        raise SystemExit(f"Server is still starting. Read {DATA / 'logs/server.log'}")
else:
    os.chdir(ROOT)
    os.execv(sys.executable, command)
