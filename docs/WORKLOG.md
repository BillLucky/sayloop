# Work log

## 2026-10-05 — Initial private delivery

- Investigated the official Kokoro model/voice catalog and personal-text practice workflow. Reused the already downloaded checkpoint; selected CPU PyTorch after measuring faster-than-realtime generation.
- Built local generation, materials, queue persistence, MP3/WAV exports, and browser practice views. Imported personal files only into the ignored local data tree.
- Resolved the Apple SDK pyopenjtalk build headers and installed the Japanese dictionary. Confirmed real inference in all nine language/accent options in Hugging Face offline mode.
- Addressed user-reported practice issues: automatic transcript following, Space pause/resume while sentence buttons are focused, explicit turn-taking mode, replay/previous/next shortcuts, collapsible sidebar, and immersive typography.
- Derived sentence timing from model tokens while keeping longer synthesis passages for natural prosody. Regenerated full recordings with original-file backups and checked complete text coverage.
- Prepared Sayloop branding, contributor and operation guides, privacy checks, private source packaging, source-only CI, and a future container deployment recipe. Kept current release private and personal artifacts out of source history.

Acceptance evidence and limitations are recorded in [VALIDATION.md](VALIDATION.md). Actual user data and evidence artifacts are local and intentionally absent from this repository.

## 2026-10-05 — 0.1.1 closeout

- Rechecked the private remote, successful initial CI runs, clean source tree, and live native server readiness.
- Reproduced and fixed a misleading stop-script success message when graceful shutdown times out. Added isolated regression cases without stopping the daily-use server.
- Added a delivery index covering completed scope, local artifacts, and explicitly unverified deployment targets.

## 2026-10-05 — 0.2.0 source-distribution preparation

- Applied the requested Apache-2.0 application license and documented GPL/LGPL dependency boundaries without publishing bundled runtimes.
- Added community/PR/issue templates, Docker setup and restore instructions, and complete-history privacy checks.
- Added four real-browser regression cases with synthetic range-aware audio at desktop/mobile widths; all passed and screenshots were inspected.
- Started real Docker build acceptance and added a separate manual Linux CI workflow for synthesis, restart, and volume restore. Personal data is never an input.

- Linux amd64 Docker synthesis, restart, and empty-volume restore passed in run 37293941307; MP3 hashes matched. Slow duplicate local ARM image downloads were stopped without touching the native service.
- Upgraded Transformers to 5.18.0 after dependency audit findings; all nine languages passed offline in an isolated native overlay. Final Docker validation passed with upgraded dependencies and all nine languages.
- Added English/Chinese README navigation and four reviewed synthetic screenshots. No personal media is published; image exceptions are restricted to those exact documentation assets.

- Final Docker run 37297083298 passed build, download, offline nine-language synthesis, restart, and empty-volume restore. Source run 37297081567 passed 34 Python, seven playback, and six browser tests.
- Installed the validated dependency update into the native environment during an idle queue and restored the daily service. Isolated native API synthesis passed; personal materials and recordings were retained.
- Prepared v0.2.0 source packaging and checked bilingual README links, approved screenshots, all reachable history, and private repository visibility. No personal media or prebuilt runtime is published.
