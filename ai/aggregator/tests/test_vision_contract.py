"""Cross-language contract tests using the browser Vision v4 fixtures."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from aggregator.vision_events import (
    VISION_EVENT_ADAPTER,
    GazeAwayStarted,
    VisionEventBatch,
    VisionMetricSnapshot,
)

_FIXTURE_DIR = (
    Path(__file__).parents[2] / "vision-analysis" / "tests" / "fixtures"
)


def _fixture(name: str) -> dict[str, object]:
    with (_FIXTURE_DIR / name).open(encoding="utf-8") as fixture_file:
        value = json.load(fixture_file)
    assert isinstance(value, dict)
    return value


def test_accepts_typescript_behavior_fixture() -> None:
    event = VISION_EVENT_ADAPTER.validate_python(
        _fixture("vision-behavior-event.valid.json")
    )
    assert isinstance(event, GazeAwayStarted)
    assert event.version == 4
    assert event.user_id == "user-a"
    assert event.payload.yaw_delta == 24.1


def test_accepts_typescript_metric_fixture() -> None:
    event = VISION_EVENT_ADAPTER.validate_python(
        _fixture("vision-metric-snapshot.valid.json")
    )
    assert isinstance(event, VisionMetricSnapshot)
    assert event.payload.observation_interval.observed_duration_ms == 800
    assert event.payload.capabilities.active_detectors


@pytest.mark.parametrize(
    ("event_type", "source", "payload"),
    [
        ("FACE_MISSING_STARTED", "FACE_QUALITY_DETECTOR", {"observedStartElapsedMs": 1}),
        (
            "FACE_MISSING_ENDED",
            "FACE_QUALITY_DETECTOR",
            {
                "observedEndElapsedMs": 2,
                "wallDurationMs": 1,
                "observedDurationMs": 1,
                "unobservedDurationMs": 0,
            },
        ),
        (
            "MULTIPLE_FACES_DETECTED",
            "FACE_QUALITY_DETECTOR",
            {"observedStartElapsedMs": 1, "faceCount": 2},
        ),
        (
            "LOW_LIGHT_STARTED",
            "FACE_QUALITY_DETECTOR",
            {
                "observedStartElapsedMs": 1,
                "brightnessScore": 0.2,
                "entryThreshold": 0.3,
            },
        ),
        (
            "LOW_LIGHT_ENDED",
            "FACE_QUALITY_DETECTOR",
            {
                "observedEndElapsedMs": 2,
                "wallDurationMs": 1,
                "observedDurationMs": 1,
                "unobservedDurationMs": 0,
                "brightnessScore": 0.5,
            },
        ),
        (
            "FACE_TOO_SMALL_STARTED",
            "FACE_QUALITY_DETECTOR",
            {
                "observedStartElapsedMs": 1,
                "faceAreaRatio": 0.05,
                "entryThreshold": 0.1,
            },
        ),
        (
            "FACE_TOO_SMALL_ENDED",
            "FACE_QUALITY_DETECTOR",
            {
                "observedEndElapsedMs": 2,
                "wallDurationMs": 1,
                "observedDurationMs": 1,
                "unobservedDurationMs": 0,
                "faceAreaRatio": 0.2,
            },
        ),
        (
            "ANALYSIS_UNAVAILABLE",
            "FACE_QUALITY_DETECTOR",
            {"observedStartElapsedMs": 1, "reasons": ["FACE_MISSING"]},
        ),
        (
            "ANALYSIS_RECOVERED",
            "FACE_QUALITY_DETECTOR",
            {
                "observedEndElapsedMs": 2,
                "wallDurationMs": 1,
                "observedDurationMs": 1,
                "unobservedDurationMs": 0,
            },
        ),
        (
            "GAZE_AWAY_STARTED",
            "SCREEN_ATTENTION_DETECTOR",
            {
                "observedStartElapsedMs": 1,
                "yawDelta": 1,
                "pitchDelta": 1,
                "rollDelta": 1,
                "centerDeltaX": 0.1,
                "centerDeltaY": 0.1,
            },
        ),
        (
            "GAZE_AWAY_ENDED",
            "SCREEN_ATTENTION_DETECTOR",
            {
                "observedEndElapsedMs": 2,
                "wallDurationMs": 1,
                "observedDurationMs": 1,
                "unobservedDurationMs": 0,
                "terminationReason": "RECOVERED",
            },
        ),
        (
            "PROLONGED_GAZE_AWAY",
            "SCREEN_ATTENTION_DETECTOR",
            {
                "activeDurationMs": 10,
                "yawDelta": 1,
                "pitchDelta": 1,
            },
        ),
        (
            "SMILE_STARTED",
            "SMILE_EXPRESSION_DETECTOR",
            {
                "observedStartElapsedMs": 1,
                "smileScore": 0.7,
                "baselineDelta": 0.2,
            },
        ),
        (
            "SMILE_ENDED",
            "SMILE_EXPRESSION_DETECTOR",
            {
                "observedEndElapsedMs": 2,
                "wallDurationMs": 1,
                "observedDurationMs": 1,
                "unobservedDurationMs": 0,
                "peakSmileScore": 0.8,
                "meanSmileScore": 0.7,
                "terminationReason": "RECOVERED",
            },
        ),
        (
            "NOD_EVENT",
            "NOD_DETECTOR",
            {
                "amplitudeDegrees": 10,
                "durationMs": 500,
                "downstrokeMs": 250,
                "upstrokeMs": 250,
            },
        ),
    ],
)
def test_accepts_every_v4_behavior_shape(
    event_type: str,
    source: str,
    payload: dict[str, object],
) -> None:
    raw = _fixture("vision-behavior-event.valid.json")
    raw["eventType"] = event_type
    raw["source"] = source
    raw["payload"] = payload
    event = VISION_EVENT_ADAPTER.validate_python(raw)
    assert event.event_type == event_type


def test_rejects_v3_event() -> None:
    raw = _fixture("vision-behavior-event.valid.json")
    raw["version"] = 3
    with pytest.raises(ValidationError):
        VISION_EVENT_ADAPTER.validate_python(raw)


def test_rejects_unknown_field() -> None:
    raw = _fixture("vision-behavior-event.valid.json")
    raw["rawLandmarks"] = []
    with pytest.raises(ValidationError):
        VISION_EVENT_ADAPTER.validate_python(raw)


def test_rejects_string_number_that_zod_would_reject() -> None:
    raw = _fixture("vision-behavior-event.valid.json")
    raw["seq"] = "125"
    with pytest.raises(ValidationError):
        VISION_EVENT_ADAPTER.validate_python(raw)


def test_rejects_null_for_optional_non_nullable_score() -> None:
    raw = _fixture("vision-behavior-event.valid.json")
    raw["measurementConfidence"] = None
    with pytest.raises(ValidationError):
        VISION_EVENT_ADAPTER.validate_python(raw)


def test_rejects_active_detector_that_is_not_configured() -> None:
    raw = _fixture("vision-metric-snapshot.valid.json")
    payload = raw["payload"]
    assert isinstance(payload, dict)
    capabilities = payload["capabilities"]
    assert isinstance(capabilities, dict)
    capabilities["configuredDetectors"] = ["FACE_QUALITY"]
    capabilities["activeDetectors"] = ["FACE_QUALITY", "NOD"]
    with pytest.raises(ValidationError):
        VISION_EVENT_ADAPTER.validate_python(raw)


def test_batch_restores_global_sequence_order() -> None:
    behavior = _fixture("vision-behavior-event.valid.json")
    metric = _fixture("vision-metric-snapshot.valid.json")
    batch = VisionEventBatch.model_validate(
        {"behaviorEvents": [behavior], "metricSnapshots": [metric]}
    )
    assert [event.seq for event in batch.ordered_events()] == [125, 126]


def test_batch_rejects_multiple_client_instances() -> None:
    behavior = _fixture("vision-behavior-event.valid.json")
    metric = _fixture("vision-metric-snapshot.valid.json")
    metric["clientInstanceId"] = "db84eb2a-0bf4-44e5-9dc9-d4eb00dce076"
    with pytest.raises(ValidationError):
        VisionEventBatch.model_validate(
            {"behaviorEvents": [behavior], "metricSnapshots": [metric]}
        )


def test_contract_dump_returns_camel_case() -> None:
    event = VISION_EVENT_ADAPTER.validate_python(
        _fixture("vision-behavior-event.valid.json")
    )
    dumped = event.model_dump(mode="json", by_alias=True)
    assert dumped["sessionId"] == "session-123"
    assert "session_id" not in dumped


def test_fixture_copy_is_independent() -> None:
    """Protect mutation-based tests from accidentally sharing fixture state."""
    original = _fixture("vision-behavior-event.valid.json")
    changed = deepcopy(original)
    changed["seq"] = 999
    assert original["seq"] == 125
