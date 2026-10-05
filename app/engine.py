import os
import subprocess
import threading
import time
from pathlib import Path

import numpy as np
import soundfile as sf

from .alignment import sentence_segments
from .config import REPO_ID, SAMPLE_RATE, VOICE_NAMES, model_path
from .text import chunks, clean_text


class SpeechEngine:
    def __init__(self):
        self.lock = threading.Lock()
        self.model = None
        self.pipelines = {}
        self.path = None
        self.device = os.environ.get("KOKORO_DEVICE", "cpu")

    def pipeline(self, language):
        import torch
        from kokoro import KModel, KPipeline

        if self.model is None:
            torch.set_num_threads(int(os.environ.get("KOKORO_THREADS", "4")))
            self.path = model_path()
            self.model = (
                KModel(
                    repo_id=REPO_ID,
                    config=str(self.path / "config.json"),
                    model=str(self.path / "kokoro-v1_0.pth"),
                )
                .to(self.device)
                .eval()
            )
        if language not in self.pipelines:
            self.pipelines[language] = KPipeline(
                lang_code=language, repo_id=REPO_ID, model=self.model
            )
        return self.pipelines[language]

    def generate(self, text, voice, speed, pause, output: Path, preview=False, progress=None):
        if voice not in VOICE_NAMES:
            raise ValueError("Unknown voice")
        text = clean_text(text)
        if not text:
            raise ValueError("No speakable text")
        # Preview processes only an opening excerpt, then caps playback at 25 seconds.
        sections = chunks(text[:1400] if preview else text, limit=120 if voice[0] in "jz" else 320)
        started = time.monotonic()
        with self.lock:
            pipeline = self.pipeline(voice[0])
            audio_parts, segments = [], []
            samples = 0
            stop = False
            for index, section in enumerate(sections):
                for result in pipeline(
                    section,
                    voice=str(self.path / "voices" / f"{voice}.pt"),
                    speed=speed,
                    split_pattern=None,
                ):
                    if result.audio is None:
                        raise RuntimeError("The model returned no audio for a text segment.")
                    audio = result.audio.detach().cpu().numpy().astype(np.float32)
                    if not np.isfinite(audio).all() or not audio.size:
                        raise RuntimeError("The model returned invalid audio.")
                    if preview and samples + len(audio) > 25 * SAMPLE_RATE:
                        audio = audio[: 25 * SAMPLE_RATE - samples]
                        fade = min(len(audio), 480)
                        audio[-fade:] *= np.linspace(1, 0, fade)
                        stop = True
                    start = samples / SAMPLE_RATE
                    audio_parts.append(audio)
                    samples += len(audio)
                    segments.extend(
                        sentence_segments(result, start, len(audio) / SAMPLE_RATE, stop)
                    )
                    if stop:
                        break
                    if pause and not preview:
                        silence = np.zeros(int(pause * SAMPLE_RATE), dtype=np.float32)
                        audio_parts.append(silence)
                        samples += len(silence)
                if progress:
                    progress(min(95, int(95 * (index + 1) / len(sections))))
                if stop:
                    break
            if not audio_parts:
                raise RuntimeError("No audio produced. Check text and language.")
            audio = np.concatenate(audio_parts)
            peak = float(np.max(np.abs(audio)))
            if peak > 0.98:
                audio *= 0.98 / peak
            output.parent.mkdir(parents=True, exist_ok=True)
            wav = output.with_suffix(".wav")
            sf.write(wav, audio, SAMPLE_RATE, subtype="PCM_16")
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(wav),
                    "-codec:a",
                    "libmp3lame",
                    "-b:a",
                    "128k",
                    str(output),
                ],
                check=True,
                capture_output=True,
                timeout=120,
            )
            return dict(
                duration=round(len(audio) / SAMPLE_RATE, 3),
                segments=segments,
                sample_rate=SAMPLE_RATE,
                elapsed=round(time.monotonic() - started, 2),
                device=self.device,
                peak=round(peak, 4),
                timing_version=2,
            )


engine = SpeechEngine()
