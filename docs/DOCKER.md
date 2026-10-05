# Docker installation

Install Docker Engine with Compose v2 on Linux, or Docker Desktop on macOS/Windows. Use at least 4 GB of memory and allow several GB of disk for Python, Torch, dictionaries, and the build cache. Exact resource use depends on the platform. CPU inference is the default. You do not need Python or Node on the host.

## Verified platforms

Linux amd64 is the container acceptance target, exercised on a clean Ubuntu 24.04 runner. Apple Silicon native Python is also verified. Docker Desktop ARM64 and Windows-host integration are not separately certified by those checks; use the native installation on Apple Silicon when you want the tested local path.

## First run

From the source checkout:

```sh
# Optional: copy .env.example to .env and choose a free SAYLOOP_PORT.
docker compose build
# Download the pinned model into the persistent model volume before first use.
docker compose run --rm sayloop python scripts/download_model.py
docker compose up -d --wait
```

Open <http://127.0.0.1:8765>. The library starts empty: paste or import your own UTF-8 text. No personal sample recordings or learning materials are supplied. The image installs FFmpeg, language packages, the English spaCy model, and the Japanese dictionary. The first build needs internet access. Model weights live in a volume, not in the image or source repository.

After the initial download, set `HF_HUB_OFFLINE=1` in `.env` and run `docker compose up -d` to recreate the service with that setting. This prevents Hugging Face downloads; it is not a network firewall. The model download is pinned in `app/config.py`.

Use `SAYLOOP_PORT=8768 docker compose up -d --wait` to avoid a native server on port 8765. Compose reads `.env`; native Python scripts do not. Keep the Compose project name consistent: different project names use different volumes.

## Operation and updates

```sh
docker compose ps
docker compose logs --tail 100 sayloop
# Wait until generation finishes before restarting/stopping.
docker compose stop
docker compose start
# After backing up data and updating the source checkout:
docker compose up -d --build --wait
```

The application runs as UID 10001 with one worker, no additional Linux capabilities, and host loopback-only networking. Health means the API is responding, not that model inference has already loaded. Do not publish this unauthenticated application directly to the internet.

## Backup and restore

Stop the idle service and copy the entire `/app/data` directory. It includes text, MP3/WAV, job settings, and sentence timing. Keep backups private. For example, from a directory you own:

```sh
mkdir -p private-backup
docker compose cp sayloop:/app/data/. ./private-backup/
```

For restore, use a **new empty** project/data volume so existing learning materials are not overwritten. Start and stop that new service once to initialize its volume, copy the backup into `/app/data/`, then correct ownership in a one-off container:

```sh
docker compose cp ./private-backup/. sayloop:/app/data/
docker compose run --rm --user root --cap-add CHOWN sayloop chown -R 10001:10001 /app/data
docker compose start
```

Never use `docker compose down -v` unless you intentionally want to erase that project's volumes. Source updates do not require deleting volumes. The model cache can be downloaded again; personal materials cannot.

## Acceptance checks

Use a dedicated test deployment (never a personal library) with `scripts/smoke_deployment.py`. It creates a synthetic article, performs real synthesis, downloads the MP3, and records its hash. After restarting or restoring into an empty volume, `--verify` checks the persisted job and exact downloaded bytes:

```sh
python3 scripts/smoke_deployment.py --url http://127.0.0.1:8768 --receipt data/validation/docker.json
docker compose restart
python3 scripts/smoke_deployment.py --url http://127.0.0.1:8768 --receipt data/validation/docker.json --verify
```

See [validation](VALIDATION.md) for the platforms actually exercised. Container recipes are distributed as source only; no prebuilt image is published. Review [third-party obligations](../THIRD_PARTY_NOTICES.md) before redistributing a bundled image.

## Private phone access

Keep host port publication on loopback. Set the exact `SAYLOOP_ALLOWED_HOSTS` hostname in ignored `.env`, recreate Compose, then run Tailscale Serve on the host. See [phone access](REMOTE_ACCESS.md#docker). Real device and network configuration must not enter the image or public repository.
