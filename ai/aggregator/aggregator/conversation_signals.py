"""Shared conservative rules for transcript-derived conversation signals."""

from __future__ import annotations

import re

# The realtime detector and the report must use the same silence definition.
DEFAULT_SILENCE_THRESHOLD_MS = 10_000

_TRAILING_PUNCTUATION = re.compile(r"[.!…~\s]+$")
_QUESTION_ENDINGS = (
    "는가요",
    "은가요",
    "인가요",
    "을까요",
    "까요",
    "뭔가요",
    "뭐예요",
    "어때요",
)


def looks_like_question(text: str) -> bool:
    """Recognize only high-confidence Korean questions.

    Whisper often omits punctuation. Broad endings such as ``세요`` and
    ``어요`` also occur in statements and requests, so treating them as a
    question would generate incorrect RESPONSE_PROMPT coaching. Ambiguous
    utterances intentionally remain unclassified until a classifier or
    punctuation-restoration model is introduced.
    """
    stripped = _TRAILING_PUNCTUATION.sub("", text.strip())
    if not stripped:
        return False
    if stripped.endswith("?"):
        return True
    return any(stripped.endswith(ending) for ending in _QUESTION_ENDINGS)


__all__ = ["DEFAULT_SILENCE_THRESHOLD_MS", "looks_like_question"]
