# Validation record

Date: 2026-10-05. Release: 0.1.0. Environment: native Apple Silicon, Python 3.11, CPU inference, FFmpeg, Chrome. Private recordings and screenshots remain in ignored local data directories.

## Audio and backend

- Nine American male previews: all 25.0 seconds, valid MP3 decoding, non-silent waveforms.
- Six supplied full texts: approximately 30.5 minutes in total; all MP3s decode and generated text covers the complete source. Personal contents are not included here.
- Full recordings upgraded to model-derived English sentence timing; originals preserved under local backups. Sentence text reassembly matches every original text, excluding whitespace normalization.
- Nine language/accent options each produced real speech with `HF_HUB_OFFLINE=1` after model/dictionary setup. This is a functional inference check, not a native-speaker pronunciation evaluation.
- Longest initial full recording: 625.1 seconds of audio generated in 42.5 seconds on the tested CPU configuration. Cold model initialization and resource downloads are separate costs.
- Python tests cover Markdown import, bounded chunk preservation, schema limits, local-origin protection, task completion/failure/recovery, export, audio downloads, material version integrity, and sentence timing.

## Browser checks

- Created a synthetic material through the editor, saved it, selected Michael, and generated a real preview and full recording.
- Downloaded the generated MP3 through the actual browser download control.
- Multipart Markdown upload passed API validation and produced a readable material. Automated native file-picker injection was unavailable through the browser extension; no extension permission settings were changed.
- Played existing preview and full audio in Chrome; checked media readiness and elapsed position.
- Reproduced the focused-sentence interaction: Space paused at the current position, and a second Space resumed instead of seeking to the sentence start.
- Listen & speak paused at the first sentence boundary and kept it selected; Space released the next sentence.
- Crossing the visible transcript boundary moved the page automatically, leaving the active sentence inside the viewport. Side navigation collapsed to an 80 px rail and exposed its expand control.
- Immersive mode displayed the active sentence, previous/next context, mode controls, transport, and exit. Keyboard Escape returned to normal practice.
- Pure playback regression tests cover continuous following, gap handling, pause/resume, sentence looping, boundary waits, seeking, replay, and typing/IME exclusions.

## Automated check results

24 Python tests and 7 JavaScript playback tests passed. Ruff lint/format checks, JavaScript syntax checks, Prettier checks, Compose configuration validation, tracked-source privacy checks, and the 15-file audio ZIP integrity check passed. Browser evidence and per-recording decode results are saved locally.

## Boundaries

The Docker Compose configuration parses, but no container build or inference was performed because a Docker daemon was not available. The browser viewport override did not change the connected browser's viewport, so phone-sized visual acceptance is not claimed. Responsive CSS is included; native desktop Chrome is the visually verified target for this release.

Model-estimated English timing can have small boundary errors. Non-English practice remains passage-based. Background browser throttling can affect pause timing; keep the practice tab active for precise turn-taking. No claims are made about pronunciation scoring, translation, or subjective voice quality.
