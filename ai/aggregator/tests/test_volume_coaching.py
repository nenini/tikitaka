"""실측 dBFS 기반 성량 코칭.

설문·미션에는 예전부터 "목소리가 너무 커요/작아요"가 있었는데 재는 코드가 없어서
AI 쪽이 통째로 비어 있었다. STT 가 발화 구간 RMS 를 실어 보내면서 판정이 가능해졌다.
"""

from __future__ import annotations

from aggregator.coaching_detectors import VolumeCoachingDetector
from aggregator.config import MvpCoachingConfig
from aggregator.state import SessionState

A = "user-A"
B = "user-B"


def _detector(**over: object) -> tuple[VolumeCoachingDetector, SessionState]:
    config = MvpCoachingConfig(**over)  # type: ignore[arg-type]
    state = SessionState(session_id="s1")
    state.register_participants([A, B])
    return VolumeCoachingDetector(config), state


def _speak(
    detector: VolumeCoachingDetector,
    state: SessionState,
    user: str,
    dbfs: float | None,
    *,
    duration_ms: int = 3_000,
    times: int = 1,
) -> None:
    for _ in range(times):
        detector.on_speech_ended(
            state, user, rms_dbfs=dbfs, speech_duration_ms=duration_ms
        )


def test_quiet_speaker_is_asked_to_speak_up() -> None:
    detector, state = _detector()
    _speak(detector, state, A, -50.0, times=3)

    candidates = detector.on_tick(state, 30_000)

    assert len(candidates) == 1
    assert candidates[0].coaching_type == "VOLUME_GUIDANCE"
    assert candidates[0].target_user_id == A
    assert candidates[0].message_key == "VOLUME_GUIDANCE_UP_01"
    assert candidates[0].reason_code == "VOICE_TOO_QUIET"


def test_loud_speaker_is_asked_to_lower() -> None:
    detector, state = _detector()
    _speak(detector, state, A, -5.0, times=3)

    candidates = detector.on_tick(state, 30_000)

    assert [c.message_key for c in candidates] == ["VOLUME_GUIDANCE_DOWN_01"]
    assert candidates[0].reason_code == "VOICE_TOO_LOUD"


def test_normal_volume_says_nothing() -> None:
    detector, state = _detector()
    _speak(detector, state, A, -22.0, times=5)

    assert detector.on_tick(state, 30_000) == []


def test_one_quiet_utterance_is_not_enough() -> None:
    """웅얼거림 한 번, 마이크를 스친 한 번으로 코칭이 나가면 안 된다."""
    detector, state = _detector()
    _speak(detector, state, A, -50.0, times=1)

    assert detector.on_tick(state, 30_000) == []


def test_recovering_volume_cancels_the_candidate() -> None:
    """표본은 최근 N개만 본다. 초반에 작았다고 세션 내내 잡히면 안 된다."""
    detector, state = _detector()
    _speak(detector, state, A, -50.0, times=3)
    assert detector.on_tick(state, 30_000)

    _speak(detector, state, A, -20.0, times=3)

    assert detector.on_tick(state, 60_000) == []


def test_short_utterances_are_excluded() -> None:
    """추임새("네")는 원래 작다. 표본에 넣으면 전부 조용한 사람이 된다."""
    detector, state = _detector()
    _speak(detector, state, A, -50.0, duration_ms=300, times=5)

    assert detector.on_tick(state, 30_000) == []


def test_missing_measurement_is_ignored() -> None:
    """음량을 안 실어 보내는 생산자(파일 재생 등)가 있어도 죽지 않는다."""
    detector, state = _detector()
    _speak(detector, state, A, None, times=5)

    assert detector.on_tick(state, 30_000) == []


def test_each_speaker_is_judged_separately() -> None:
    detector, state = _detector()
    _speak(detector, state, A, -50.0, times=3)
    _speak(detector, state, B, -21.0, times=3)

    candidates = detector.on_tick(state, 30_000)

    assert [c.target_user_id for c in candidates] == [A]


def test_trigger_id_is_stable_for_the_same_samples() -> None:
    """같은 표본으로 매 tick 다른 trigger_id 가 나오면 정책이 중복을 못 막는다."""
    detector, state = _detector()
    _speak(detector, state, A, -50.0, times=3)

    first = detector.on_tick(state, 30_000)[0].trigger_id
    second = detector.on_tick(state, 30_500)[0].trigger_id

    assert first == second


# ── 정책 연동 ────────────────────────────────────────────────────


def test_volume_cooldown_and_cap_are_actually_wired() -> None:
    """설정값이 읽히는지 확인한다.

    voice_cooldown_ms / voice_max_per_user 를 추가해 놓고 cooldown_for() 와
    상한 검사에 연결하지 않아, 값만 있고 아무 효과가 없던 적이 있다.
    """
    config = MvpCoachingConfig()
    assert config.cooldown_for("VOLUME_GUIDANCE") == config.voice_cooldown_ms
    assert config.cooldown_for("VOLUME_GUIDANCE") != config.default_cooldown_ms
    assert config.max_per_type_for("VOLUME_GUIDANCE") == config.voice_max_per_user
    assert config.max_per_type_for("SILENCE_RECOVERY") is None


def test_policy_stops_after_the_per_user_cap() -> None:
    """같은 잔소리를 반복하면 코칭이 아니라 압박이 된다."""
    from aggregator.coaching import CoachingPolicy
    from aggregator.coaching_candidates import CoachingCandidate

    config = MvpCoachingConfig()
    state = SessionState(session_id="s1")
    state.register_participants([A, B])
    policy = CoachingPolicy(config=config)

    delivered = 0
    for index in range(config.voice_max_per_user + 3):
        command = policy.evaluate_candidate(
            CoachingCandidate(
                coaching_type="VOLUME_GUIDANCE",
                target_user_id=A,
                message_key="VOLUME_GUIDANCE_UP_01",
                reason_code="VOICE_TOO_QUIET",
                # 쿨다운을 넘겨 가며 던져도 상한에서 멈춰야 한다.
                triggered_at_ms=index * (config.voice_cooldown_ms + 1_000),
                trigger_id=f"volume:UP:{A}:{index}",
                priority="MEDIUM",
            ),
            state,
        )
        if command is not None:
            delivered += 1

    assert delivered == config.voice_max_per_user
