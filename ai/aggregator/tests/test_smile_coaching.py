"""Vision v4 smile Metric + STT listening-context coaching."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from aggregator.aggregator import SessionAggregator
from aggregator.coaching import CoachingCommand
from aggregator.config import MvpCoachingConfig

_FIXTURE = (
    Path(__file__).parents[2]
    / "vision-analysis"
    / "tests"
    / "fixtures"
    / "vision-metric-snapshot.valid.json"
)


def _metric(*, seq: int, ended_ms: int, score: float = 0.1) -> dict[str, object]:
    with _FIXTURE.open(encoding="utf-8") as fixture_file:
        raw = json.load(fixture_file)
    assert isinstance(raw, dict)
    metric = deepcopy(raw)
    metric["eventId"] = str(uuid4())
    metric["seq"] = seq
    metric["sessionElapsedMs"] = ended_ms
    metric["clientMonotonicMs"] = float(ended_ms)
    payload = metric["payload"]
    assert isinstance(payload, dict)
    payload["observationInterval"] = {
        "startedAtSessionElapsedMs": ended_ms - 1_000,
        "endedAtSessionElapsedMs": ended_ms,
        "observedDurationMs": 1_000,
    }
    metrics = payload["metrics"]
    assert isinstance(metrics, dict)
    smile = metrics["smile"]
    assert isinstance(smile, dict)
    smile["configurationScore"] = score
    smile["confidence"] = 0.8
    smile["promptSuppressedByBaseline"] = False
    metrics["smileScore"] = score
    return metric


def _aggregator() -> tuple[SessionAggregator, list[CoachingCommand]]:
    coaching: list[CoachingCommand] = []
    config = MvpCoachingConfig(
        low_smile_observed_ms=2_000,
        low_smile_cooldown_ms=10_000,
        low_smile_max_per_user=2,
    )
    aggregator = SessionAggregator(
        "session-123",
        on_analysis=lambda event: None,
        on_coaching=coaching.append,
        detectors=[],
        config=config,
        participant_user_ids=["user-a", "user-b"],
    )
    return aggregator, coaching


def test_low_smile_guidance_uses_valid_listening_observation() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-b").is_speaking = True

    aggregator.push_vision_event(_metric(seq=126, ended_ms=1_000))
    aggregator.tick(1_000)
    assert coaching == []

    aggregator.push_vision_event(_metric(seq=127, ended_ms=2_000))
    aggregator.tick(2_000)

    assert len(coaching) == 1
    assert coaching[0].coaching_type == "EXPRESSION_GUIDANCE"
    assert coaching[0].message_key == "EXPRESSION_GUIDANCE_01"
    assert coaching[0].target_user_id == "user-a"


def test_low_smile_time_does_not_accumulate_without_partner_speech() -> None:
    aggregator, coaching = _aggregator()

    aggregator.push_vision_event(_metric(seq=126, ended_ms=1_000))
    aggregator.push_vision_event(_metric(seq=127, ended_ms=2_000))
    aggregator.tick(2_000)

    assert coaching == []
    assert aggregator.state.user("user-a").vision.low_smile_observed_ms == 0


def test_detected_smile_resets_accumulated_time() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-b").is_speaking = True

    aggregator.push_vision_event(_metric(seq=126, ended_ms=1_000))
    aggregator.push_vision_event(
        _metric(seq=127, ended_ms=2_000, score=0.4)
    )
    aggregator.push_vision_event(_metric(seq=128, ended_ms=3_000))
    aggregator.tick(3_000)

    assert coaching == []
    assert (
        aggregator.state.user("user-a").vision.low_smile_observed_ms == 1_000
    )


def test_expression_guidance_obeys_cooldown_and_two_message_limit() -> None:
    aggregator, coaching = _aggregator()
    aggregator.state.user("user-b").is_speaking = True
    aggregator.push_vision_event(_metric(seq=126, ended_ms=1_000))
    aggregator.push_vision_event(_metric(seq=127, ended_ms=2_000))

    aggregator.tick(2_000)
    aggregator.tick(9_999)
    aggregator.tick(12_000)
    aggregator.tick(22_000)

    expression = [
        command
        for command in coaching
        if command.coaching_type == "EXPRESSION_GUIDANCE"
    ]
    assert len(expression) == 2
