# Repository Guidelines

## Project Structure & Module Organization

Sayloop is a local FastAPI speech studio with browser-native JavaScript. `app/` contains API, storage, generation, and sentence alignment. `web/` contains the interface and playback controller. `scripts/` holds setup, import, generation, backup-aware timing upgrades, and packaging tools. `tests/` contains Python API tests and JavaScript playback tests. `docs/` describes architecture, operation, usage, and acceptance evidence.

Personal texts, audio, logs, screenshots, and backups belong in ignored `data/`. Model weights stay in the Hugging Face cache or an explicitly configured model folder. Never add either to Git.

## Build, Test, and Development Commands

- `./scripts/setup.sh`: create the Python environment and prepare dependencies, model cache, and dictionaries.
- `.venv/bin/python scripts/serve.py`: serve locally at `http://127.0.0.1:8765`.
- `npm ci --ignore-scripts`: install development formatting tools; no frontend build is required.
- `.venv/bin/python -m pytest -q`: run isolated API and alignment tests.
- `npm test`: run playback state-machine tests.
- `npm run check && npm run format:check`: validate browser modules and formatting.
- `.venv/bin/ruff check app scripts tests`: lint Python.
- `python3 scripts/privacy_check.py`: inspect tracked files before pushing.

## Coding Style & Naming Conventions

Use four-space Python indentation, snake_case functions, and Ruff. Browser code uses ES modules, two-space indentation, single quotes, and Prettier. Keep playback transitions in `web/practice-player.js`; UI controls must call the same transport rather than maintaining competing state.

## Testing Guidelines

Use pytest (`test_*.py`) and Node's native test runner (`*.test.mjs`). Use synthetic fixtures and isolated data directories. Add regression coverage for behavioral fixes. For player changes, also verify real browser playback, keyboard focus, scrolling, sentence boundaries, and immersive entry/exit. Report untested platforms explicitly; no numeric coverage threshold is imposed.

## Commit & Pull Request Guidelines

The initial release establishes focused Conventional Commit prefixes such as `feat:`, `fix:`, and `docs:`. Explain the trigger, resulting behavior, and verification in reviews. Use synthetic screenshots. Update the changelog and affected technical guides. Keep the repository private until the owner explicitly authorizes public release; audit history and artifacts before changing visibility.
