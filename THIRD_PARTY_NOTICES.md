# Third-party notices

Sayloop application source is licensed under **Apache-2.0** beginning with 0.2.0. Earlier tagged releases retain their original MIT license. Dependencies are downloaded by the installer and are **not all Apache-licensed**. This repository distributes application source and build recipes, not prebuilt dependency bundles or personal recordings.

| Component | License / source of notice | Distribution boundary |
| --- | --- | --- |
| Kokoro-82M weights and voice tensors | [Apache-2.0 model card](https://huggingface.co/hexgrad/Kokoro-82M) | Download separately at the pinned revision; preserve upstream model-card attribution if redistributing |
| Kokoro / Misaki code | [Kokoro license](https://github.com/hexgrad/kokoro/blob/main/LICENSE), [Misaki license](https://github.com/hexgrad/misaki/blob/main/LICENSE), Apache-2.0 | Installed Python packages |
| phonemizer-fork | Installed metadata: GPL-3.0-or-later; [upstream license](https://github.com/bootphon/phonemizer/blob/master/LICENSE) | Used by the speech dependency chain; not relicensed by Sayloop |
| eSpeak NG (loaded by espeakng-loader) | [GPL-3.0-or-later](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING) | Native phonemizer library; wrapper and bundled library notices must be reviewed separately |
| num2words | Installed metadata: LGPL; [upstream](https://github.com/savoirfairelinux/num2words) | Python dependency |
| FFmpeg | [Build-dependent LGPL/GPL terms](https://ffmpeg.org/legal.html) | External encoder installed by the user or Debian image; inspect `ffmpeg -buildconf` |
| PyTorch, spaCy, FastAPI, Uvicorn, Transformers, dictionaries and other packages | Each installed distribution's license metadata and license files | Exact versions in `requirements.lock`; dictionary/data terms can differ from wrapper code |
| Playwright / Prettier | Apache-2.0 / MIT, respectively | Development tools only; versions in `package-lock.json` |

The Kokoro model card attributes Koniwa (CC BY 3.0) and SIWIS (CC BY 4.0) training data. Sayloop does not bundle that dataset. Follow the [upstream attribution section](https://huggingface.co/hexgrad/Kokoro-82M#creative-commons-attribution) when reviewing model redistribution.

`python scripts/dependency_inventory.py` records installed Python package versions and declared license metadata without collecting environment variables or user data. Metadata is an inventory, not a legal compatibility determination. Unknown declarations must be reviewed against package license files.

## Source releases versus binary distribution

Users build their own environment and download models on their own computers. No prebuilt container is published by this project. Publishing a container, standalone executable, or bundled runtime needs a separate review of all included GPL/LGPL components, corresponding-source obligations, dictionary licenses, and attribution. An Apache-2.0 application notice alone does not satisfy those obligations or grant rights to other components.

The learning workflow links to [1000 Hours](https://1000h.org/training-tasks/kick-off.html); its article is not copied. Users retain responsibility for rights to their own text and recordings. No user's learning materials are included in this repository or its source release.
