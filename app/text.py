import re


def clean_text(text: str) -> str:
    """Remove Markdown presentation, preserving readable words and paragraph breaks."""
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\ufeff", "")
    text = re.sub(r"```[^\n]*\n.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"(?m)^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)", "", text)
    text = re.sub(r"(?m)^\s*[-*_]{3,}\s*$", "", text)
    text = text.replace("**", "").replace("__", "").replace("`", "")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def chunks(text: str, limit: int = 320) -> list[str]:
    """Bound every chunk, including punctuation-free input and CJK text."""
    result = []
    for paragraph in re.split(r"\n+", text):
        sentences = re.split(r"(?<=[.!?。！？])\s+|(?<=[。！？])", paragraph.strip())
        current = ""
        for sentence in sentences:
            while len(sentence) > limit:
                cut = sentence.rfind(" ", 0, limit + 1)
                if cut < limit // 3:
                    cut = limit
                if current:
                    result.append(current)
                    current = ""
                result.append(sentence[:cut].strip())
                sentence = sentence[cut:].strip()
            if len(current) + len(sentence) + 1 > limit:
                if current:
                    result.append(current)
                current = sentence
            else:
                current = (current + " " + sentence).strip()
        if current:
            result.append(current)
    return result
