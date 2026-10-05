# Contributing to Sayloop

Keep the core workflow small: personal text, local speech, deliberate practice. Please discuss new cloud services, accounts, databases, or paid dependencies before introducing them.

## Development

Run `./scripts/setup.sh`, then `npm ci --ignore-scripts`. Use `.venv/bin/python scripts/serve.py` for the app. Python uses four-space indentation and Ruff. Browser modules use two spaces, single quotes, and Prettier. Prefer plain functions and explicit state transitions over a framework dependency for small interactions.

Python tests live in `tests/test_*.py`; playback tests use `tests/*.test.mjs` and Node's native runner. Tests must use synthetic content and isolated temporary data. Do not load a contributor's personal corpus or downloaded recordings into fixtures.

Before opening a pull request:

```sh
.venv/bin/python -m pytest -q
.venv/bin/ruff check app scripts tests
.venv/bin/ruff format --check app scripts tests
npm test && npm run check && npm run format:check
npx playwright install chromium
npm run test:browser
python3 scripts/privacy_check.py
```

Browser tests start an isolated static server and use synthetic API/audio fixtures, with desktop and mobile viewports. Set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome locally.

For playback changes, reproduce the issue in a real browser. Cover focused sentence buttons, pause/resume position, sentence-boundary modes, seeking, track switches, automatic scrolling, keyboard typing, immersive entry/exit, and reduced motion. Screenshots must use synthetic material before sharing.

## Changes and reviews

Use focused commits such as `fix: preserve playback position on Space` or `feat: add sentence practice mode`. Describe the user-visible trigger, resulting behavior, and evidence of verification. Link relevant issues and include screenshots for UI changes. Mark tests that were not run and explain why.

Keep `README.md`, the user guide, architecture, operations notes, and changelog consistent with the final implementation. Never commit `data/`, model weights, credentials, logs, home-directory paths, or personal screenshots. Public contributions must contain source and reviewed synthetic examples only.

## License and contributions

New contributions are submitted under Apache-2.0, the same license as the current application source. Submit only work you have the right to contribute; preserve third-party notices and identify copied or adapted code. Do not contribute personal text, recordings, model checkpoints, or generated audio. A separate contributor agreement is not required.
