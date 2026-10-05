#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo "Run ./scripts/setup.sh first."
  exit 1
fi
.venv/bin/python scripts/serve.py --background
open http://127.0.0.1:8765
