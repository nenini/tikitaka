"""Vision v4 ingestion tests for SessionAggregator."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from aggregator.aggregator import (
    SessionAggregator,
    VisionSequenceError,
    VisionSessionMismatchError,
)
from aggregator.events import AnalysisEvent

_FIXTURE_DIR = (
    Path(__file__).parents[2] / "vision-analysis" / "tests" / "fixtures"
)


def _fixture(name: str) -> dict[str, object]:
    with (_FIXTURE_DIR / name).open(encoding="utf-8") as fixture_file:
        value = json.load(fixture_file)
    assert isinstance(value, dict)
    return value


def _aggregator() -> tuple[SessionAggregator, list[AnalysisEvent]]:
    analysis: list[AnalysisEvent] = []
    return (
        SessionAggregator(
            "session-123",
            on_analysis=analysis.append,
            detectors=[],
        ),
        analysis,
    )


def test_push_vision_event_updates_state_without_coaching_analysis() -> None:
    aggregator, analysis = _aggregator()
    raw = _fixture("vision-behavior-event.valid.json")

    assert aggregator.push_vision_event(raw)

    user = aggregator.state.vision_users["user-a"]
    assert user.latest_behavior is not None
    assert user.latest_behavior.event_type == "GAZE_AWAY_STARTED"
    assert len(user.active_episodes) == 1
    assert analysis == []


def test_push_batch_updates_behavior_and_latest_metric() -> None:
    aggregator, _ = _aggregator()
    behavior = _fixture("vision-behavior-event.valid.json")
    metric = _fixture("vision-metric-snapshot.valid.json")

    result = aggregator.push_vision_batch(
        {"behaviorEvents": [behavior], "metricSnapshots": [metric]}
    )

    assert len(result.accepted_event_ids) == 2
    user = aggregator.state.vision_users["user-a"]
    assert user.latest_behavior is not None
    assert user.latest_metric is not None
    assert user.latest_metric.seq == 126
    assert user.metric_snapshot_count == 1
    assert user.usable_snapshot_count == 1
    assert user.observation_window_ms == 1_000
    assert user.usable_observed_ms == 800


def test_retrying_same_batch_is_idempotent() -> None:
    aggregator, _ = _aggregator()
    batch = {
        "behaviorEvents": [_fixture("vision-behavior-event.valid.json")],
        "metricSnapshots": [_fixture("vision-metric-snapshot.valid.json")],
    }
    aggregator.push_vision_batch(batch)
    retry = aggregator.push_vision_batch(batch)

    assert retry.accepted_event_ids == []
    assert len(retry.duplicate_event_ids) == 2


def test_wrong_session_is_rejected_before_state_change() -> None:
    aggregator, _ = _aggregator()
    raw = _fixture("vision-behavior-event.valid.json")
    raw["sessionId"] = "another-session"

    with pytest.raises(VisionSessionMismatchError):
        aggregator.push_vision_event(raw)
    assert aggregator.state.vision_users == {}


def test_wrong_session_rejects_whole_batch_before_state_change() -> None:
    aggregator, _ = _aggregator()
    valid = _fixture("vision-behavior-event.valid.json")
    valid["sessionId"] = "another-session"
    wrong = _fixture("vision-metric-snapshot.valid.json")
    wrong["sessionId"] = "another-session"

    with pytest.raises(VisionSessionMismatchError):
        aggregator.push_vision_batch(
            {"behaviorEvents": [valid], "metricSnapshots": [wrong]}
        )
    assert aggregator.state.vision_users == {}


def test_older_sequence_is_rejected() -> None:
    aggregator, _ = _aggregator()
    original = _fixture("vision-behavior-event.valid.json")
    aggregator.push_vision_event(original)
    stale = deepcopy(original)
    stale["eventId"] = str(uuid4())
    stale["seq"] = 124

    with pytest.raises(VisionSequenceError):
        aggregator.push_vision_event(stale)


def test_new_client_instance_can_restart_at_seq_one() -> None:
    aggregator, _ = _aggregator()
    original = _fixture("vision-behavior-event.valid.json")
    aggregator.push_vision_event(original)
    restarted = deepcopy(original)
    restarted["eventId"] = str(uuid4())
    restarted["clientInstanceId"] = str(uuid4())
    restarted["seq"] = 1

    assert aggregator.push_vision_event(restarted)


def test_ended_event_closes_active_episode() -> None:
    aggregator, _ = _aggregator()
    started = _fixture("vision-behavior-event.valid.json")
    aggregator.push_vision_event(started)
    episode_id = UUID(str(started["episodeId"]))
    ended = deepcopy(started)
    ended["eventId"] = str(uuid4())
    ended["eventType"] = "GAZE_AWAY_ENDED"
    ended["seq"] = 126
    ended["sessionElapsedMs"] = 185_000
    ended["payload"] = {
        "observedEndElapsedMs": 185_000,
        "wallDurationMs": 2_300,
        "observedDurationMs": 2_000,
        "unobservedDurationMs": 300,
        "terminationReason": "RECOVERED",
    }

    assert aggregator.push_vision_event(ended)
    assert episode_id not in aggregator.state.vision_users["user-a"].active_episodes
