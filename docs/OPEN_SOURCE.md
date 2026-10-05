# Open-source readiness

The repository remains private. This checklist prepares source distribution; it does not authorize changing visibility or publishing personal artifacts.

## Included foundations

- Apache-2.0 application license, NOTICE, third-party license boundaries, contribution terms, and private security reporting guidance.
- README, native setup, Docker installation, operation/backup/restore instructions, architecture, and versioned changelog.
- Pinned dependencies, direct dependency input, package inventory tool, and model revision pinning.
- Python, playback, and desktop/mobile browser regressions using synthetic fixtures; source checks in CI.
- Bug/PR templates and monthly Actions/npm dependency update proposals.
- Git ignore rules, a Docker context allowlist, source-only release archives, and staged/history privacy checks.

## Before a public source release

1. Obtain the owner's explicit approval to change repository visibility.
2. Run `python3 scripts/privacy_check.py --history` with all branches/tags fetched. Review the history and GitHub attachments manually too: pattern matching is not a comprehensive content or secret audit.
3. Confirm release assets contain only committed source and checksums. Never attach `data/`, audio exports, model weights, screenshots of personal content, or private logs.
4. Run acceptance checks on the claimed deployment platforms and update the validation record. Do not extrapolate mobile emulation to physical iOS/Android devices.
5. Review all changed dependencies and their licenses. Application Apache-2.0 terms do not cover bundled GPL/LGPL runtimes, dictionaries, or model attribution.
6. Confirm vulnerability reporting is usable by prospective contributors and review repository settings when visibility changes.

## Updating dependencies

`requirements.in` lists direct Python dependencies; `requirements.lock` records the tested full environment. Regenerate with a Python 3.11 resolver in an isolated environment, inspect the diff, and exercise all language options and Docker before replacing the lock. Do not freeze an unrelated global Python installation. Use `npm ci --ignore-scripts` for browser development tools. Dependabot proposals require tests and human review, not automatic merging.

Windows-native Python, GPU/MLX, public multi-user hosting, and physical mobile-device support are not advertised as validated features. They can be separate future milestones rather than hidden requirements for the local source release.
