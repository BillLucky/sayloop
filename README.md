# Sayloop

**English** | [简体中文](README.zh-CN.md)

**Your words, out loud.** A personal speech studio and language practice room that runs on your own computer.

Write something you want to say, turn it into speech, and practice one sentence at a time. Sayloop uses [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M); no paid speech API or account is required. Sayloop is open source; personal materials and recordings are never included.

## What you can do

- Import UTF-8 `.txt` or `.md` files, or paste text directly.
- Explore 54 voices across nine language/accent options, including nine American male voices.
- Preview up to 25 seconds before generating a full recording.
- Adjust speaking pace and pauses; download MP3, WAV, or a ZIP of recordings and text.
- Practice with synchronized sentence highlighting and automatic scrolling.
- Choose continuous listening, **Listen & speak** (pause after each sentence), or sentence looping.
- Enter an immersive listening room with large text, muted surrounding sentences, and keyboard controls.
- Keep your work on disk. Drafts and interface preferences stay in browser storage.

Speech generation does **not** translate text. Select the language already used in your material. Voice quality varies; Kokoro does not expose an emotion-intensity slider. English sentence timing comes from the model's token durations; other languages currently use synthesis passages.

## A look inside

Screenshots use synthetic demonstration text, never personal learning materials.

**Your material library** — keep your own writing ready for practice.

![Sayloop material library](docs/images/library.jpg)

**Speech studio** — choose a voice, adjust pacing, preview, then generate.

![Sayloop speech studio](docs/images/studio.jpg)

**Immersive practice** — follow the current sentence, pause, speak, and continue.

![Sayloop immersive practice](docs/images/practice.jpg)

<details>
<summary>Mobile-sized practice view</summary>

<img src="docs/images/mobile.jpg" width="320" alt="Sayloop at a mobile browser width" />

Verified in Chrome mobile emulation; physical iOS/Android devices are not yet acceptance-tested.
</details>

## Run locally

Tested on Apple Silicon with Python 3.11. Install [uv](https://docs.astral.sh/uv/) and FFmpeg first (`brew install ffmpeg` on macOS).

```sh
git clone https://github.com/BillLucky/sayloop.git
cd sayloop
./scripts/setup.sh
.venv/bin/python scripts/serve.py
```

Open **http://127.0.0.1:8765**. On macOS, double-click `start.command` for background startup and browser launch. The Python environment is isolated to `.venv`; Node is only needed for development checks.

Setup reuses the Hugging Face cache before downloading weights. First-time setup also installs the English language model and Japanese dictionary (the dictionary download is about 526 MB). After setup, all nine language options were exercised successfully with `HF_HUB_OFFLINE=1`.

```sh
# Background service
.venv/bin/python scripts/serve.py --background
# Stop this project's idle background service
.venv/bin/python scripts/stop.py
# Import your own directory; originals are copied, not removed
.venv/bin/python scripts/import_materials.py /path/to/your/texts
# Generate nine US male previews and full recordings
.venv/bin/python scripts/generate_library.py --voice am_fenrir
# Create friendly filenames and a local audio ZIP
.venv/bin/python scripts/export_library.py
```

## Docker

```sh
docker compose build
docker compose run --rm sayloop python scripts/download_model.py
docker compose up -d --wait
```

Open the same local URL. The library starts empty; import your own material. Weights download separately into a persistent volume. See [Docker setup, offline use, backup and restore](docs/DOCKER.md). No prebuilt image, personal text, or recordings are published.

## Practice controls

| Action | Control |
| --- | --- |
| Pause / continue; advance after a Listen & speak pause | `Space` |
| Previous / next sentence | `←` / `→` |
| Replay current sentence | `R` |
| Enter / leave immersive mode | `F` / `Esc` |
| Pause at every sentence | **Listen & speak** |
| Repeat one sentence | **Loop sentence** |
| Keep the active text visible | **Auto-follow** |

Shortcuts do not intercept typing, input controls, or IME composition. Clicking a sentence seeks to it. At the end of a recording, Space starts again; R repeats the final sentence. Listening time is a convenience counter, not a measurement of speaking practice.

## Development and documentation

```sh
npm ci --ignore-scripts
npm test && npm run check && npm run format:check
.venv/bin/python -m pytest -q
.venv/bin/ruff check app scripts tests
.venv/bin/ruff format --check app scripts tests
npx playwright install chromium
npm run test:browser
python3 scripts/privacy_check.py --history
```

- [Open-source readiness and dependency updates](docs/OPEN_SOURCE.md)
- [Architecture and implementation](docs/ARCHITECTURE.md)
- [Operation, backup, migration, and packaging](docs/OPERATIONS.md)
- [User guide / 中文使用说明](docs/USER_GUIDE.zh-CN.md)
- [Delivery checklist / 交付索引](docs/DELIVERY.zh-CN.md)
- [Verification record](docs/VALIDATION.md)
- [Contributing](CONTRIBUTING.md), [privacy boundaries](SECURITY.md), [changelog](CHANGELOG.md)

Native and Docker installation instructions are provided. See the validation record for the exact tested platforms. The application is single-user and loopback-only by default, with no authentication layer.

## Credits and license

Application code: [Apache-2.0](LICENSE). Kokoro weights and third-party packages retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). The practice workflow is inspired by [Li Xiaolai](https://github.com/xiaolai)'s [1000 Hours](https://1000h.org/why.html), especially its [kick-off task](https://1000h.org/training-tasks/kick-off.html): prepare meaningful personal text, listen, speak, and repeat. Thank you to the author and the [everyone-can-use-english / Enjoy community](https://github.com/ZuodaoTech/everyone-can-use-english) for sharing their work. Sayloop is an independent implementation, with no implied affiliation or endorsement. See [acknowledgements](docs/ACKNOWLEDGEMENTS.md).
