"""Vision-only and Vision-ready MVP coaching rules."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from aggregator.aggregator import SessionAggregator
from aggregator.coaching import CoachingCommand
from aggregator.config import MvpCoachingConfig
from aggregator.events import AnalysisEvent

_FIXTURE_DIR = (
    Path(__file__).parents[2] / "vision-analysis" / "tests" / "fixtures"
)


def _fixture(name: str) -> dict[str, object]:
    with (_FIXTURE_DIR / name).open(encoding="utf-8") as fixture_file:
        value = json.load(fixture_file)
    assert isinstance(value, dict)
    return value


def _aggregator(
    *,
    config: MvpCoachingConfig | None = None,
) -> tuple[SessionAggregator, list[CoachingCommand]]:
    analysis: list[AnalysisEvent] = []
    coaching: list[CoachingCommand] = []
    aggregator = SessionAggregator(
        "session-123",
        on_analysis=analysis.append,
        on_coaching=coaching.append,
        detectors=[],
        config=config,
    )
    return aggregator, coaching


def _prolonged_gaze(*, seq: int = 127) -> dict[str, object]:
    raw = _fixture("vision-behavior-event.valid.json")
    raw["eventId"] = str(uuid4())
    raw["eventType"] = "PROLONGED_GAZE_AWAY"
    raw["seq"] = seq
    raw["sessionElapsedMs"] = 186_000
    raw["payload"] = {
        "activeDurationMs": 3_800,
        "yawDelta": 24.1,
        "pitchDelta": 3.6,
    }
    return raw


def _face_missing_started(
    *,
    seq: int = 125,
    observed_start_ms: int = 1_000,
) -> dict[str, object]:
    raw = _fixture("vision-behavior-event.valid.json")
    raw["eventId"] = str(uuid4())
    raw["eventType"] = "FACE_MISSING_STARTED"
    raw["source"] = "FACE_QUALITY_DETECTOR"
    raw["seq"] = seq
    raw["sessionElapsedMs"] = observed_start_ms
    raw["coachingEligible"] = False
    raw["baselineMode"] = "NOT_APPLICABLE"
    raw["baselineEpoch"] = 0
    raw["payload"] = {"observedStartElapsedMs": observed_start_ms}
    return raw


def _analysis_unavailable() -> dict[str, object]:
    raw = _face_missing_started()
    raw["eventType"] = "ANALYSIS_UNAVAILABLE"
    raw["payload"] = {
        "observedStartElapsedMs": 1_000,
        "reasons": ["CAMERA_DISABLED"],
    }
    return raw


def test_attention_coaches_listener_when_partner_is_speaking() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-b").is_speaking = True
    aggregator.push_vision_event(
        _fixture("vision-metric-snapshot.valid.json")
    )

    aggregator.push_vision_event(_prolonged_gaze())

    assert len(coaching) == 1
    command = coaching[0]
    assert command.coaching_type == "ATTENTION_RECOVERY"
    assert command.target_user_id == "user-a"
    assert command.message_key == "ATTENTION_RECOVERY_01"
    assert command.expires_at_session_elapsed_ms == 201_000


def test_attention_stays_off_until_stt_fills_speaking_state() -> None:
    aggregator, coaching = _aggregator()
    aggregator.push_vision_event(
        _fixture("vision-metric-snapshot.valid.json")
    )

    aggregator.push_vision_event(_prolonged_gaze())

    assert coaching == []


def test_attention_requires_usable_latest_metric() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-b").is_speaking = True
    metric = _fixture("vision-metric-snapshot.valid.json")
    payload = metric["payload"]
    assert isinstance(payload, dict)
    quality = payload["quality"]
    assert isinstance(quality, dict)
    quality["usable"] = False
    quality["state"] = "UNUSABLE"
    quality["reasons"] = ["FACE_MISSING"]
    quality["faceDetected"] = False
    quality["faceCount"] = 0
    quality["faceBoxRatio"] = None
    aggregator.push_vision_event(metric)

    aggregator.push_vision_event(_prolonged_gaze())

    assert coaching == []


def test_attention_rejects_ineligible_event() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-b").is_speaking = True
    aggregator.push_vision_event(
        _fixture("vision-metric-snapshot.valid.json")
    )
    event = _prolonged_gaze()
    event["coachingEligible"] = False

    aggregator.push_vision_event(event)

    assert coaching == []


def test_attention_does_not_interrupt_current_speaker() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-a").is_speaking = True
    aggregator.state.user("user-b").is_speaking = True
    aggregator.push_vision_event(
        _fixture("vision-metric-snapshot.valid.json")
    )

    aggregator.push_vision_event(_prolonged_gaze())

    assert coaching == []


def test_camera_problem_blocks_attention_coaching() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-b").is_speaking = True
    aggregator.push_vision_event(
        _fixture("vision-metric-snapshot.valid.json")
    )
    aggregator.push_vision_event(_face_missing_started(seq=127))

    aggregator.push_vision_event(_prolonged_gaze(seq=128))

    assert coaching == []


def test_same_gaze_episode_coaches_only_once() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-b").is_speaking = True
    aggregator.push_vision_event(
        _fixture("vision-metric-snapshot.valid.json")
    )
    first = _prolonged_gaze(seq=127)
    aggregator.push_vision_event(first)
    repeated = _prolonged_gaze(seq=128)
    repeated["episodeId"] = first["episodeId"]
    repeated["sessionElapsedMs"] = 250_000
    aggregator.push_vision_event(repeated)

    assert len(coaching) == 1


def test_face_missing_guidance_waits_for_threshold() -> None:
    config = MvpCoachingConfig(face_missing_guidance_ms=5_000)
    aggregator, coaching = _aggregator(config=config)
    aggregator.push_vision_event(_face_missing_started())

    aggregator.tick(5_999)
    assert coaching == []

    aggregator.tick(6_000)
    assert len(coaching) == 1
    assert coaching[0].message_key == "FACE_VISIBILITY_01"
    assert coaching[0].target_user_id == "user-a"

    aggregator.tick(20_000)
    assert len(coaching) == 1


def test_face_too_small_sends_specific_guidance_after_three_seconds() -> None:
    aggregator, coaching = _aggregator()
    face_too_small = _face_missing_started(observed_start_ms=1_000)
    face_too_small["eventType"] = "FACE_TOO_SMALL_STARTED"
    face_too_small["payload"] = {
        "observedStartElapsedMs": 1_000,
        "faceAreaRatio": 0.01,
        "entryThreshold": 0.025,
    }
    aggregator.push_vision_event(face_too_small)

    # Vision also reports that analysis is unavailable for the same reason.
    unavailable = _analysis_unavailable()
    unavailable["eventId"] = str(uuid4())
    unavailable["episodeId"] = str(uuid4())
    unavailable["seq"] = 126
    unavailable["payload"] = {
        "observedStartElapsedMs": 1_000,
        "reasons": ["FACE_TOO_SMALL"],
    }
    aggregator.push_vision_event(unavailable)

    aggregator.tick(3_999)
    assert coaching == []

    aggregator.tick(4_000)
    assert len(coaching) == 1
    assert coaching[0].message_key == "FACE_DISTANCE_01"
    assert coaching[0].reason_code == "FACE_TOO_SMALL"


def test_quality_only_unavailable_does_not_send_generic_camera_guidance() -> None:
    for reason in ("FACE_MISSING", "FACE_TOO_SMALL", "LOW_LIGHT"):
        aggregator, coaching = _aggregator(
            config=MvpCoachingConfig(vision_setup_startup_grace_ms=0)
        )
        unavailable = _analysis_unavailable()
        unavailable["payload"] = {
            "observedStartElapsedMs": 1_000,
            "reasons": [reason],
        }

        aggregator.push_vision_event(unavailable)
        aggregator.tick(20_000)

        assert coaching == [], reason


def test_technical_failure_still_sends_generic_camera_guidance() -> None:
    aggregator, coaching = _aggregator(
        config=MvpCoachingConfig(vision_setup_startup_grace_ms=0)
    )
    unavailable = _analysis_unavailable()
    unavailable["payload"] = {
        "observedStartElapsedMs": 1_000,
        "reasons": ["FACE_TOO_SMALL", "WORKER_ERROR"],
    }

    aggregator.push_vision_event(unavailable)

    assert len(coaching) == 1
    assert coaching[0].message_key == "VISION_UNAVAILABLE_01"


def test_analysis_unavailable_guidance_waits_for_startup_grace() -> None:
    aggregator, coaching = _aggregator()

    aggregator.push_vision_event(_analysis_unavailable())
    assert coaching == []

    aggregator.tick(2_999)
    assert coaching == []
    aggregator.tick(3_000)

    assert len(coaching) == 1
    assert coaching[0].message_key == "VISION_UNAVAILABLE_01"
    assert coaching[0].priority == "HIGH"
    assert not aggregator.state.user("user-a").vision.vision_available


def test_setup_cooldown_is_independent_per_reason() -> None:
    aggregator, coaching = _aggregator(
        config=MvpCoachingConfig(
            vision_setup_startup_grace_ms=0,
            face_missing_guidance_ms=0,
        )
    )
    aggregator.push_vision_event(_analysis_unavailable())
    face_missing = _face_missing_started(seq=126)
    face_missing["episodeId"] = str(uuid4())
    aggregator.push_vision_event(face_missing)
    aggregator.tick(1_000)

    assert [command.message_key for command in coaching] == [
        "VISION_UNAVAILABLE_01",
        "FACE_VISIBILITY_01",
    ]


def test_face_recovery_closes_setup_episode_before_threshold() -> None:
    aggregator, coaching = _aggregator()
    started = _face_missing_started()
    aggregator.push_vision_event(started)
    ended = deepcopy(started)
    ended["eventId"] = str(uuid4())
    ended["eventType"] = "FACE_MISSING_ENDED"
    ended["seq"] = 126
    ended["sessionElapsedMs"] = 2_000
    ended["payload"] = {
        "observedEndElapsedMs": 2_000,
        "wallDurationMs": 1_000,
        "observedDurationMs": 1_000,
        "unobservedDurationMs": 0,
    }
    aggregator.push_vision_event(ended)

    aggregator.tick(10_000)

    assert coaching == []
