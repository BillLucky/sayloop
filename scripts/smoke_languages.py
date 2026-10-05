"""Exercise actual speech inference for every exposed language option."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA, ensure_dirs
from app.engine import engine

samples = {
    "a": (
        "am_fenrir",
        "Every day, I practice saying the things that matter to me. Learning a language helps me understand the world.",
    ),
    "b": (
        "bm_george",
        "Every day, I practice saying the things that matter to me. Learning a language helps me understand the world.",
    ),
    "e": (
        "em_alex",
        "Cada día practico un poco. Aprender un idioma me ayuda a comprender el mundo y conocer a otras personas.",
    ),
    "f": (
        "ff_siwis",
        "Chaque jour, je pratique un peu. Apprendre une langue me permet de mieux comprendre le monde.",
    ),
    "h": ("hm_omega", "मैं हर दिन अभ्यास करता हूँ। नई भाषा सीखना मुझे दुनिया को समझने में मदद करता है।"),
    "i": (
        "im_nicola",
        "Ogni giorno mi esercito un po'. Imparare una lingua mi aiuta a capire il mondo e incontrare nuove persone.",
    ),
    "p": (
        "pm_alex",
        "Todos os dias eu pratico um pouco. Aprender um idioma me ajuda a compreender o mundo e conhecer novas pessoas.",
    ),
    "z": (
        "zm_yunxi",
        "每天我都会练习说自己想说的话。学习语言帮助我理解世界，也让我认识不同文化中的人。",
    ),
    "j": (
        "jm_kumo",
        "毎日少しずつ練習しています。新しい言語を学ぶことで、世界をもっと理解できるようになります。",
    ),
}
ensure_dirs()
results = []
for language, (voice, text) in samples.items():
    try:
        output = DATA / "validation" / f"language-{language}.mp3"
        result = engine.generate(text, voice, 1, 0.3, output)
        results.append(
            dict(language=language, voice=voice, duration=result["duration"], status="passed")
        )
    except Exception as error:
        results.append(dict(language=language, voice=voice, status="failed", error=str(error)))
    print(results[-1], flush=True)
(DATA / "logs" / "languages.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
if any(r["status"] == "failed" for r in results):
    raise SystemExit(1)
