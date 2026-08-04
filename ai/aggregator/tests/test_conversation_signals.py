"""Shared conservative question and silence policy tests."""

from __future__ import annotations

import pytest

from aggregator.conversation_signals import (
    DEFAULT_SILENCE_THRESHOLD_MS,
    looks_like_question,
)
from aggregator.detectors import SilenceDetector


@pytest.mark.parametrize(
    "text",
    [
        "주말에는 무엇을 하세요?",
        "이번 주말에 같이 갈까요",
        "가장 좋아하는 음식은 뭔가요",
        "그 방법은 어때요",
    ],
)
def test_high_confidence_question_is_shared(text: str) -> None:
    assert looks_like_question(text)


@pytest.mark.parametrize(
    "text",
    [
        "엄두가 안 나요",
        "언제나 응원하고 있어요",
        "저희 어머니",
        "편하게 사세요",
        "어디 사세요",
    ],
)
def test_ambiguous_unpunctuated_korean_is_not_a_question(text: str) -> None:
    assert not looks_like_question(text)


def test_realtime_silence_uses_shared_threshold() -> None:
    assert SilenceDetector().threshold_ms == DEFAULT_SILENCE_THRESHOLD_MS
