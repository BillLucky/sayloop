"""Sentence boundaries from Kokoro's English token durations, not guessed word ratios."""

import re


def sentence_segments(result, start, duration, clipped=False):
    tokens = result.tokens or []
    if not tokens or not any(t.start_ts is not None for t in tokens):
        return [
            dict(
                text=result.graphemes,
                start=round(start, 3),
                end=round(start + duration, 3),
                clipped=clipped,
            )
        ]
    groups, group = [], []
    for index, token in enumerate(tokens):
        group.append(token)
        punctuation = bool(re.fullmatch(r"[.!?。！？]+", token.text))
        closes = index + 1 < len(tokens) and tokens[index + 1].text in ('"', "”", "’", "'", ")")
        previous_end = (
            len(group) > 1
            and bool(re.fullmatch(r"[.!?。！？]+", group[-2].text))
            and token.text in ('"', "”", "’", "'", ")")
        )
        if (punctuation and not closes) or previous_end:
            groups.append(group)
            group = []
    if group:
        groups.append(group)
    output = []
    cursor = 0.0
    for index, group in enumerate(groups):
        if cursor >= duration:
            break
        next_group = groups[index + 1] if index + 1 < len(groups) else []
        next_start = next((t.start_ts for t in next_group if t.start_ts is not None), duration)
        end = min(duration, max(cursor, float(next_start)))
        text = "".join(t.text + t.whitespace for t in group).strip()
        if text and end > cursor:
            output.append(
                dict(
                    text=text,
                    start=round(start + cursor, 3),
                    end=round(start + end, 3),
                    clipped=clipped and end >= duration,
                )
            )
        cursor = end
    return output or [
        dict(
            text=result.graphemes,
            start=round(start, 3),
            end=round(start + duration, 3),
            clipped=clipped,
        )
    ]
