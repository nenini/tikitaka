"""코칭 파이프라인 — 게이트·쿨다운·TTL·상한 검증."""

from __future__ import annotations

from aggregator.coaching import CoachingPolicy
from aggregator.events import QuestionAsked, QuestionPayload, SilenceDetected, SilencePayload
from aggregator.state import SessionState


def _silence(now_ms: int) -> SilenceDetected:
    return SilenceDetected(
        session_id="t",
        speaker_id=None,
        session_elapsed_ms=now_ms,
        payload=SilencePayload(silence_sec=10.0),
    )


def test_silence_makes_coaching() -> None:
    policy = CoachingPolicy()
    state = SessionState("t")
    command = policy.evaluate(_silence(12000), state)
    assert command is not None
    assert command.coaching_type == "SILENCE_RECOVERY"
    assert command.message_key == "SILENCE_RECOVERY_01"
    assert command.event_type == "COACHING_REQUESTED"
    assert command.expires_at_session_elapsed_ms == 12000 + 15000  # 기본 TTL


def test_cooldown_blocks_repeat() -> None:
    policy = CoachingPolicy(cooldown_ms=60_000)
    state = SessionState("t")
    assert policy.evaluate(_silence(12000), state) is not None
    assert policy.evaluate(_silence(30000), state) is None  # 18초 < 60초
    assert policy.evaluate(_silence(80000), state) is not None  # 68초 경과


def test_question_makes_no_coaching() -> None:
    policy = CoachingPolicy()
    state = SessionState("t")
    question = QuestionAsked(
        session_id="t",
        speaker_id="user-A",
        session_elapsed_ms=1000,
        payload=QuestionPayload(text="뭐 하세요?", question_count=1),
    )
    assert policy.evaluate(question, state) is None


def test_max_per_session() -> None:
    policy = CoachingPolicy(cooldown_ms=0, max_per_session=2)
    state = SessionState("t")
    assert policy.evaluate(_silence(1000), state) is not None
    assert policy.evaluate(_silence(2000), state) is not None
    assert policy.evaluate(_silence(3000), state) is None  # 세션 상한 초과
