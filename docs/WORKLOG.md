# Work log

## 2026-10-05 — Initial private delivery

- Investigated the official Kokoro model/voice catalog and personal-text practice workflow. Reused the already downloaded checkpoint; selected CPU PyTorch after measuring faster-than-realtime generation.
- Built local generation, materials, queue persistence, MP3/WAV exports, and browser practice views. Imported personal files only into the ignored local data tree.
- Resolved the Apple SDK pyopenjtalk build headers and installed the Japanese dictionary. Confirmed real inference in all nine language/accent options in Hugging Face offline mode.
- Addressed user-reported practice issues: automatic transcript following, Space pause/resume while sentence buttons are focused, explicit turn-taking mode, replay/previous/next shortcuts, collapsible sidebar, and immersive typography.
- Derived sentence timing from model tokens while keeping longer synthesis passages for natural prosody. Regenerated full recordings with original-file backups and checked complete text coverage.
- Prepared Sayloop branding, contributor and operation guides, privacy checks, private source packaging, source-only CI, and a future container deployment recipe. Kept current release private and personal artifacts out of source history.

Acceptance evidence and limitations are recorded in [VALIDATION.md](VALIDATION.md). Actual user data and evidence artifacts are local and intentionally absent from this repository.
