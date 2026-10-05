#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
command -v uv >/dev/null || { echo 'Install uv first: https://docs.astral.sh/uv/'; exit 1; }
command -v ffmpeg >/dev/null || { echo 'Install FFmpeg first (macOS: brew install ffmpeg).'; exit 1; }
uv venv --python 3.11 --allow-existing .venv
# pyopenjtalk 0.4.1 needs explicit POSIX includes with recent Apple SDKs.
if [ "$(uname -s)" = Darwin ]; then
  export CXXFLAGS="${CXXFLAGS:-} -include unistd.h -include sys/stat.h -include fcntl.h -include dirent.h"
fi
uv pip install --python .venv/bin/python -r requirements.lock
.venv/bin/python scripts/download_model.py
.venv/bin/python - <<'PY'
from pathlib import Path
import subprocess
import sys
import unidic
if not (Path(unidic.DICDIR) / 'mecabrc').is_file():
    subprocess.run([sys.executable, '-m', 'unidic', 'download'], check=True)
PY
echo 'Setup complete. Run .venv/bin/python scripts/serve.py'
