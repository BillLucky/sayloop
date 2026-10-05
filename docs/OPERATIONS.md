# Operations and release guide

## Supported local setup

Use Python 3.11, uv, FFmpeg, and an isolated `.venv`. Run `./scripts/setup.sh` once. This installs pinned dependencies, checks the model cache, and prepares the Japanese dictionary. On recent Apple SDKs, pyopenjtalk needs explicit POSIX include flags; the setup script supplies them locally without changing system compiler settings.

`start.command` launches the background server and opens its page on macOS. For development use `.venv/bin/python scripts/serve.py`; Ctrl-C stops it. For background operation use `--background` and stop with `scripts/stop.py`, which checks process ownership and refuses to interrupt an active generation queue. If the process remains alive after five seconds, the command exits unsuccessfully and reports that it is still running. Inspect the log and retry later; it never escalates to a forced kill.

The server is not registered as a login service. After a restart, run `start.command` again. Logs are in `data/logs/server.log`. Check readiness with `curl --noproxy '*' http://127.0.0.1:8765/api/health` if a local proxy is configured. Health indicates API availability; `loaded` becomes true after the first inference.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLH_DATA_DIR` | project `data/` | Persistent personal data directory |
| `KOKORO_MODEL_DIR` | unset | Existing folder containing `config.json`, `kokoro-v1_0.pth`, and `voices/` |
| `HF_HOME` | Hugging Face default | Hugging Face cache root |
| `HF_HUB_OFFLINE` | unset | Set `1` to prohibit Hugging Face downloads |
| `KOKORO_DEVICE` | `cpu` | Torch device; only CPU was validated for this release |
| `KOKORO_THREADS` | `4` | Inference thread count |

Environment variables are read from the process; `.env` is **not** loaded automatically. Startup may be slow on a cold cache. Do not use Uvicorn `--workers` above one. The batch generator and timing-upgrade script should run while the web generation queue is idle.

## Data ownership and backup

`data/originals/` keeps source copies; `materials/` holds text snapshots; `jobs/` holds settings and timing; `audio/` holds MP3/WAV; `exports/` contains friendly filenames and ZIPs. `backups/` contains pre-upgrade originals. This entire tree is ignored by Git and excluded from Docker build context and source archives.

Stop an idle server, copy the complete data directory to a private backup destination, and keep that backup separate from the source repository. Do not back up only `audio/`: practice timing lives in `jobs/`. Browser drafts and preferences are browser-local and do not migrate with the data directory; save important drafts to the library first.

To move to another machine: install the source and dependencies; copy your private data directory; copy or download the pinned model cache; point `LLH_DATA_DIR` and optionally `KOKORO_MODEL_DIR` at those locations; start one server; play a recording and generate a short preview. English and Japanese linguistic resources live in the Python environment and are prepared by setup, separately from the model cache.

## Recovery

- Interrupted job: use Retry; the original material remains intact.
- Missing FFmpeg: install it and restart from a shell with FFmpeg on PATH.
- Missing model offline: run `scripts/download_model.py` once online or supply a complete model folder.
- Japanese MeCab dictionary error: run `.venv/bin/python -m unidic download`.
- Old passage-level recordings: `scripts/upgrade_timing.py` backs up and regenerates full recordings with English sentence timestamps; it skips already upgraded jobs.
- Port occupied: choose `scripts/serve.py --port 8767` instead of stopping an unrelated service.

## Containers and remote access

`docker compose config --quiet` validates the supplied recipe. `docker compose up --build -d` builds the Python application, installs FFmpeg/dictionaries, and uses named volumes for data and model cache. It publishes **only** `127.0.0.1:8765`; the container itself listens on `0.0.0.0` so port forwarding works. Named container volumes are separate from the native `data/` folder.

See [Docker installation](DOCKER.md) for first-run model setup, offline mode, backup/restore commands, and a repeatable synthesis/restart test. The [validation record](VALIDATION.md) lists the platforms actually exercised. Reference: [FastAPI container deployment](https://fastapi.tiangolo.com/deployment/docker/).

For a personal remote server, keep the listener private and use an SSH tunnel (`ssh -L 8765:127.0.0.1:8765 your-host`) to reach it locally. Public hosting and multi-user service require a separate security design; do not simply widen the bind address or trusted hosts.

## Source releases

1. Run Python/JavaScript tests, format checks, real generation, and browser acceptance.
2. Stage source and run `python3 scripts/privacy_check.py`; inspect `git diff --cached`.
3. Commit with a GitHub noreply email. Create an annotated version tag and push to the source repository.
4. Run `python3 scripts/package_release.py`. It archives committed source only, with a SHA-256 companion file, under `data/releases/`.
5. Before each release, audit Git history and release assets, use synthetic screenshots only, review licenses, and validate the target deployment platform. Public visibility was explicitly authorized by the owner on 2026-10-05.

Audio packs are personal exports, never GitHub release assets. No automated deployment or public publishing occurs in this repository.

## Private phone access

Use `scripts/network.py --tailscale` with the project Python to configure private HTTPS, or `--lan YOUR_COMPUTER_LAN_IPV4` to opt into trusted LAN HTTP. Restart only after generation finishes. Settings remain in ignored `data/network.json`; startup prints configured access URLs locally. Follow [remote access operations](REMOTE_ACCESS.md) for setup, rollback, Docker and browser cache behavior.
