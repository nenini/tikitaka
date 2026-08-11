"""코칭 파이프라인 — 게이트·쿨다운·TTL·상한 검증."""

from __future__ import annotations

from aggregator.coaching import CoachingPolicy
from aggregator.coaching_candidates import CoachingCandidate
from aggregator.coaching_catalog import COACHING_MESSAGES
from aggregator.config import MvpCoachingConfig
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
    assert command.expires_at_session_elapsed_ms == 12_000 + 15_000
    assert command.version == 2
    assert command.target_user_id is None


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


def test_default_coaching_limits_match_mvp_policy() -> None:
    config = MvpCoachingConfig()
    assert config.max_per_user == 25
    assert config.max_per_session == 50
    assert config.low_smile_score_threshold == 0.15


def _attention_candidate(
    *,
    user_id: str,
    now_ms: int,
    trigger_id: str,
) -> CoachingCandidate:
    return CoachingCandidate(
        coaching_type="ATTENTION_RECOVERY",
        target_user_id=user_id,
        message_key="ATTENTION_RECOVERY_01",
        reason_code="PROLONGED_GAZE_AWAY_WHILE_LISTENING",
        triggered_at_ms=now_ms,
        trigger_id=trigger_id,
        priority="MEDIUM",
    )


def test_candidate_cooldown_is_per_user() -> None:
    policy = CoachingPolicy(cooldown_ms=60_000)
    state = SessionState("t")
    first = policy.evaluate_candidate(
        _attention_candidate(user_id="A", now_ms=1_000, trigger_id="episode-A"),
        state,
    )
    other_user = policy.evaluate_candidate(
        _attention_candidate(user_id="B", now_ms=2_000, trigger_id="episode-B"),
        state,
    )
    assert first is not None
    assert other_user is not None


def test_same_trigger_is_blocked_even_after_cooldown() -> None:
    policy = CoachingPolicy(cooldown_ms=1_000)
    state = SessionState("t")
    candidate = _attention_candidate(
        user_id="A",
        now_ms=1_000,
        trigger_id="same-episode",
    )
    assert policy.evaluate_candidate(candidate, state) is not None
    repeated = _attention_candidate(
        user_id="A",
        now_ms=5_000,
        trigger_id="same-episode",
    )
    assert policy.evaluate_candidate(repeated, state) is None


def test_per_user_limit_blocks_additional_coaching() -> None:
    config = MvpCoachingConfig(
        default_cooldown_ms=0,
        max_per_user=1,
    )
    policy = CoachingPolicy(config=config)
    state = SessionState("t")
    assert (
        policy.evaluate_candidate(
            _attention_candidate(user_id="A", now_ms=1_000, trigger_id="one"),
            state,
        )
        is not None
    )
    assert (
        policy.evaluate_candidate(
            _attention_candidate(user_id="A", now_ms=2_000, trigger_id="two"),
            state,
        )
        is None
    )


def test_inactive_session_blocks_candidate() -> None:
    policy = CoachingPolicy()
    state = SessionState("t", session_active=False)
    assert (
        policy.evaluate_candidate(
            _attention_candidate(user_id="A", now_ms=1_000, trigger_id="one"),
            state,
        )
        is None
    )


def test_p0_and_p1_message_catalog_is_ready() -> None:
    expected_keys = {
        "ATTENTION_RECOVERY_01",
        "ATTENTION_RECOVERY_02",
        "ATTENTION_RECOVERY_03",
        "SILENCE_RECOVERY_01",
        "SILENCE_RECOVERY_02",
        "SILENCE_RECOVERY_03",
        "SILENCE_RECOVERY_04",
        "SILENCE_RECOVERY_05",
        "FACE_VISIBILITY_01",
        "FACE_DISTANCE_01",
        "LIGHTING_GUIDANCE_01",
        "VISION_UNAVAILABLE_01",
        "REACTION_PROMPT_01",
        "REACTION_PROMPT_02",
        "REACTION_PROMPT_03",
        "RESPONSE_PROMPT_01",
        "RESPONSE_PROMPT_02",
        "RESPONSE_PROMPT_03",
    }
    assert expected_keys <= COACHING_MESSAGES.keys()


def test_coaching_types_match_backend_enum() -> None:
    """BE CoachingType enum과 값 집합이 같아야 한다.

    BE는 닫힌 enum이라 여기에만 있는 값을 보내면 400으로 코칭이 유실된다.
    새 코칭 타입을 추가할 땐 BE enum 추가를 먼저 받고 이 목록을 늘린다.
    """
    from typing import get_args

    from aggregator.coaching_candidates import CoachingType

    assert set(get_args(CoachingType)) == {
        "SILENCE_RECOVERY",
        "RESPONSE_PROMPT",
        "REACTION_PROMPT",
        "ATTENTION_RECOVERY",
        "VISION_SETUP_GUIDANCE",
        "EXPRESSION_GUIDANCE",
        "VOLUME_GUIDANCE",
        "QUESTION_SUGGESTION",
    }
