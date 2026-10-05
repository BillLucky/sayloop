import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("LLH_DATA_DIR", ROOT / "data")).expanduser().resolve()
REPO_ID = "hexgrad/Kokoro-82M"
VERSION = "0.1.0"
REVISION = "f3ff3571791e39611d31c381e3a41a3af07b4987"
SAMPLE_RATE = 24000
LANGUAGES = {
    "a": "American English",
    "b": "British English",
    "e": "Spanish",
    "f": "French",
    "h": "Hindi",
    "i": "Italian",
    "j": "Japanese",
    "p": "Brazilian Portuguese",
    "z": "Mandarin Chinese",
}
VOICE_NAMES = [
    "af_alloy",
    "af_aoede",
    "af_bella",
    "af_heart",
    "af_jessica",
    "af_kore",
    "af_nicole",
    "af_nova",
    "af_river",
    "af_sarah",
    "af_sky",
    "am_adam",
    "am_echo",
    "am_eric",
    "am_fenrir",
    "am_liam",
    "am_michael",
    "am_onyx",
    "am_puck",
    "am_santa",
    "bf_alice",
    "bf_emma",
    "bf_isabella",
    "bf_lily",
    "bm_daniel",
    "bm_fable",
    "bm_george",
    "bm_lewis",
    "ef_dora",
    "em_alex",
    "em_santa",
    "ff_siwis",
    "hf_alpha",
    "hf_beta",
    "hm_omega",
    "hm_psi",
    "if_sara",
    "im_nicola",
    "jf_alpha",
    "jf_gongitsune",
    "jf_nezumi",
    "jf_tebukuro",
    "jm_kumo",
    "pf_dora",
    "pm_alex",
    "pm_santa",
    "zf_xiaobei",
    "zf_xiaoni",
    "zf_xiaoxiao",
    "zf_xiaoyi",
    "zm_yunjian",
    "zm_yunxi",
    "zm_yunxia",
    "zm_yunyang",
]
VOICE_NOTES = {
    "am_fenrir": "Full-length default · compare it with Michael and Puck",
    "am_michael": "A second choice for long-form narration",
    "am_puck": "Try it with conversational writing",
    "am_adam": "Official training grade F+ · listen before using",
    "am_santa": "Limited training data · audition first",
}


def ensure_dirs():
    for name in ("materials", "originals", "audio", "jobs", "logs"):
        (DATA / name).mkdir(parents=True, exist_ok=True)


def model_path():
    explicit = os.environ.get("KOKORO_MODEL_DIR")
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if not (path / "kokoro-v1_0.pth").is_file():
            raise RuntimeError(
                "KOKORO_MODEL_DIR must contain config.json, kokoro-v1_0.pth and voices/."
            )
        return path
    from huggingface_hub import snapshot_download
    from huggingface_hub.errors import LocalEntryNotFoundError

    options = dict(
        repo_id=REPO_ID,
        revision=REVISION,
        allow_patterns=["config.json", "kokoro-v1_0.pth", "voices/*.pt"],
    )
    try:
        return Path(snapshot_download(**options, local_files_only=True))
    except LocalEntryNotFoundError as error:
        if os.environ.get("HF_HUB_OFFLINE") == "1":
            raise RuntimeError(
                "Model is not cached. Run scripts/download_model.py once online."
            ) from error
        return Path(snapshot_download(**options))
