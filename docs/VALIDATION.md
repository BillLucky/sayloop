# Validation record

Date: 2026-10-05. Release: 0.1.1 (0.1.0 browser/audio acceptance retained; operational patch regression verified). Environment: native Apple Silicon, Python 3.11, CPU inference, FFmpeg, Chrome. Private recordings and screenshots remain in ignored local data directories.

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

27 Python tests and 7 JavaScript playback tests passed. Ruff lint/format checks, JavaScript syntax checks, Prettier checks, Compose configuration validation, tracked-source privacy checks, and the 15-file audio ZIP integrity check passed. Browser evidence and per-recording decode results are saved locally.

The 0.1.1 shutdown patch was also exercised against a real isolated server: background startup succeeded, graceful stop succeeded, and its port no longer accepted connections. The daily-use server was left running. Timeout reporting is covered by a failing-before/fixed-after regression.

## Boundaries

Desktop (1440 × 900) and mobile-emulated (390 × 844) Chrome browser regressions now pass with synthetic text and a range-capable WAV fixture. They exercise real browser media pause/resume, turn-taking, automatic scrolling, sidebar folding, immersive entry/exit, and layout overflow. Screenshots were inspected. This is not physical iOS/Android acceptance.

Docker 0.2.0 build and persistence acceptance is being recorded separately below; do not infer a successful container run from configuration parsing alone.

Model-estimated English timing can have small boundary errors. Non-English practice remains passage-based. Background browser throttling can affect pause timing; keep the practice tab active for precise turn-taking. No claims are made about pronunciation scoring, translation, or subjective voice quality.


## 0.2.0 source preparation

34 Python tests, seven Node playback tests, and six desktop/mobile browser cases passed locally. Staged and historical privacy scanning, license inventory, and deployment smoke tools were added. Browser API fixtures do not substitute for real model inference; Docker inference/persistence has its own acceptance workflow.

## Docker and dependency acceptance

The initial Linux amd64 Docker acceptance run [37293941307](https://github.com/BillLucky/sayloop/actions/runs/37293941307) built from a clean runner, downloaded the model, synthesized and downloaded a 5.275-second synthetic recording, restarted the service, and restored data into a separate empty volume. Both persistence checks matched the exact MP3 SHA-256. No image or audio artifact was published.

Transformers 5.18.0 with Hugging Face Hub 1.33.0 was exercised in an isolated native dependency overlay: all nine language/accent samples synthesized successfully with `HF_HUB_OFFLINE=1`. The original daily-use environment was not modified by that experiment. Final Docker revalidation uses these upgraded pins and also runs all nine languages.

The updated Python lock and npm development lock were audited on 2026-10-05 with pip-audit and the official npm advisory endpoint; both reported no known vulnerabilities. This is a point-in-time advisory check, not a guarantee of absence of vulnerabilities.
