from types import SimpleNamespace

from app.alignment import sentence_segments


def token(text, start, end, space=" "):
    return SimpleNamespace(text=text, start_ts=start, end_ts=end, whitespace=space)


def test_timing_uses_model_boundaries_and_preserves_abbreviations():
    tokens = [
        token("The", 0, 0.2),
        token("U.S.", 0.3, 0.8),
        token("team", 0.9, 1.2, ""),
        token(".", 1.2, 1.3),
        token("Welcome", 1.5, 2, ""),
        token("!", 2, 2.3, ""),
    ]
    result = SimpleNamespace(tokens=tokens, graphemes="The U.S. team. Welcome!")
    segments = sentence_segments(result, 10, 3)
    assert [s["text"] for s in segments] == ["The U.S. team.", "Welcome!"]
    assert segments[0]["end"] == 11.5 and segments[1]["start"] == 11.5
    assert segments[-1]["end"] == 13


def test_clipped_preview_does_not_emit_phantom_sentences():
    result = SimpleNamespace(
        tokens=[token("First", 0, 0.5, ""), token(".", 0.5, 1), token("Second", 2, 3)],
        graphemes="First. Second",
    )
    segments = sentence_segments(result, 0, 1.5, True)
    assert len(segments) == 1 and segments[0]["clipped"]
