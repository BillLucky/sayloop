"""Stop only the background server recorded for this project; refuse an active queue."""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA, ROOT
from app.storage import list_jobs

if any(j["status"] in ("queued", "running") for j in list_jobs()):
    raise SystemExit("Generation is active. Wait for the queue to finish before stopping.")
pidfile = DATA / "server.pid"
if not pidfile.exists():
    raise SystemExit("No background server PID is recorded.")
pid = int(pidfile.read_text())
result = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True)
if "uvicorn app.main:app" not in result.stdout or str(ROOT) not in result.stdout:
    raise SystemExit(
        "The recorded process is absent or belongs to another application; left unchanged."
    )
os.kill(pid, signal.SIGTERM)
for _ in range(50):
    process = subprocess.run(["ps", "-p", str(pid), "-o", "stat="], capture_output=True, text=True)
    if not process.stdout.strip() or process.stdout.strip().startswith("Z"):
        break
    time.sleep(0.1)
else:
    raise SystemExit(
        f"Sayloop server {pid} is still running after the stop request. "
        f"Check {DATA / 'logs/server.log'} and retry later; no forced stop was sent."
    )
print(f"Stopped Sayloop server {pid}. Your data is unchanged.")
