"""Exercise a dedicated test deployment with synthetic text, then verify persisted audio."""

import argparse
import hashlib
import json
import time
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default="http://127.0.0.1:8768")
parser.add_argument("--receipt", type=Path, required=True)
parser.add_argument(
    "--verify", action="store_true", help="Check a receipt after restart or restore"
)
args = parser.parse_args()
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def request(path, body=None):
    req = urllib.request.Request(
        args.url + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    with opener.open(req, timeout=30) as response:
        return response.read()


def api(path, body=None):
    return json.loads(request(path, body))


for attempt in range(30):
    try:
        assert api("/api/health")["ffmpeg"]
        break
    except OSError:
        if attempt == 29:
            raise
        time.sleep(1)
if args.verify:
    receipt = json.loads(args.receipt.read_text())
    job = api(f"/api/generations/{receipt['id']}")
    assert job["status"] == "completed"
    assert hashlib.sha256(request(job["audio_url"])).hexdigest() == receipt["sha256"]
    print("Persisted recording and downloaded bytes verified.")
else:
    text = "Every day is a chance to learn. Listen carefully, then make these words your own."
    material = api("/api/materials", {"title": "Synthetic deployment check", "text": text})
    job = api(
        "/api/generations",
        {
            "title": material["title"],
            "text": text,
            "material_id": material["id"],
            "voice": "am_fenrir",
            "kind": "full",
        },
    )
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        job = api(f"/api/generations/{job['id']}")
        if job["status"] == "completed":
            break
        if job["status"] in {"failed", "interrupted"}:
            raise SystemExit(f"Generation failed: {job.get('error', job['status'])}")
        time.sleep(2)
    else:
        raise SystemExit("Generation timed out after ten minutes.")
    audio = request(job["audio_url"])
    assert len(audio) > 1000 and job["duration"] > 1 and job["segments"]
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(
        json.dumps(
            {
                "id": job["id"],
                "sha256": hashlib.sha256(audio).hexdigest(),
                "duration": job["duration"],
            },
            indent=2,
        )
    )
    print(f"Real synthesis and download passed: {job['duration']} seconds.")
