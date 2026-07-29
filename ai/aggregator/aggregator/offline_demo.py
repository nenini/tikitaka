"""Offline STT v2 + Vision v4 scenarios for the control-room MVP."""

from __future__ import annotations

import argparse
import json
import time
from collections.abc import Callable
from pathlib import Path
from uuid import uuid4

from stt.events import (
    SpeechStartedEvent,
    SpeechStartedPayload,
    TranscriptFinalizedEvent,
    TranscriptPayload,
)

from aggregator.aggregator import (
    AnalysisEmitter,
    CoachingEmitter,
    SessionAggregator,
)
from aggregator.console_sink import console_coaching_emit, console_emit

SESSION_ID = "offline-mvp"
USER_A = "user-a"
USER_B = "user-b"
_CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
_CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
_FIXTURE_DIR = (
    Path(__file__).parents[2] / "vision-analysis" / "tests" / "fixtures"
)

Scenario = Callable[[SessionAggregator], None]


def _fixture(name: str) -> dict[str, object]:
    with (_FIXTURE_DIR / name).open(encoding="utf-8") as fixture_file:
        raw = json.load(fixture_file)
    assert isinstance(raw, dict)
    raw["sessionId"] = SESSION_ID
    return raw


def _transcript(
    user_id: str,
    text: str,
    start_ms: int,
    end_ms: int,
    *,
    client_id: str,
    seq: int = 1,
) -> TranscriptFinalizedEvent:
    return TranscriptFinalizedEvent(
        session_id=SESSION_ID,
        user_id=user_id,
        participant_identity=f"participant-{user_id}",
        client_instance_id=client_id,
        utterance_id=str(uuid4()),
        seq=seq,
        session_elapsed_ms=end_ms,
        confidence=0.9,
        payload=TranscriptPayload(
            text=text,
            language="ko",
            segment_start_ms=start_ms,
            segment_end_ms=end_ms,
        ),
    )


def _speech_started(
    user_id: str,
    start_ms: int,
    *,
    client_id: str,
) -> SpeechStartedEvent:
    return SpeechStartedEvent(
        session_id=SESSION_ID,
        user_id=user_id,
        participant_identity=f"participant-{user_id}",
        client_instance_id=client_id,
        utterance_id=str(uuid4()),
        seq=1,
        session_elapsed_ms=start_ms,
        confidence=0.9,
        payload=SpeechStartedPayload(observed_start_elapsed_ms=start_ms),
    )


def _normal(aggregator: SessionAggregator) -> None:
    aggregator.push_stt_event(
        _transcript(
            USER_A,
            "안녕하세요. 만나서 반갑습니다.",
            0,
            1500,
            client_id=_CLIENT_A,
        )
    )
    aggregator.push_stt_event(
        _transcript(
            USER_B,
            "저도 반갑습니다.",
            1800,
            3000,
            client_id=_CLIENT_B,
        )
    )
    aggregator.tick(4000)


def _camera(aggregator: SessionAggregator) -> None:
    raw = _fixture("vision-behavior-event.valid.json")
    raw["eventId"] = str(uuid4())
    raw["eventType"] = "ANALYSIS_UNAVAILABLE"
    raw["source"] = "FACE_QUALITY_DETECTOR"
    raw["userId"] = USER_A
    raw["coachingEligible"] = False
    raw["baselineMode"] = "NOT_APPLICABLE"
    raw["baselineEpoch"] = 0
    raw["payload"] = {
        "observedStartElapsedMs": 1000,
        "reasons": ["CAMERA_DISABLED"],
    }
    aggregator.push_vision_event(raw)


def _attention(aggregator: SessionAggregator) -> None:
    metric = _fixture("vision-metric-snapshot.valid.json")
    metric["userId"] = USER_A
    aggregator.push_vision_event(metric)
    aggregator.push_stt_event(
        _speech_started(USER_B, 180_000, client_id=_CLIENT_B)
    )
    gaze = _fixture("vision-behavior-event.valid.json")
    gaze["eventId"] = str(uuid4())
    gaze["eventType"] = "PROLONGED_GAZE_AWAY"
    gaze["userId"] = USER_A
    gaze["seq"] = 127
    gaze["sessionElapsedMs"] = 186_000
    gaze["payload"] = {
        "activeDurationMs": 5_000,
        "yawDelta": 24.1,
        "pitchDelta": 3.6,
    }
    aggregator.push_vision_event(gaze)


def _silence(aggregator: SessionAggregator) -> None:
    aggregator.push_stt_event(
        _transcript(
            USER_A,
            "천천히 이야기해 봐요.",
            0,
            1000,
            client_id=_CLIENT_A,
        )
    )
    aggregator.tick(11_000)


def _response(aggregator: SessionAggregator) -> None:
    aggregator.push_stt_event(
        _transcript(
            USER_B,
            "주말에는 보통 무엇을 하세요?",
            0,
            1000,
            client_id=_CLIENT_B,
        )
    )
    aggregator.tick(6000)


def _reaction(aggregator: SessionAggregator) -> None:
    aggregator.push_stt_event(
        _speech_started(USER_B, 1000, client_id=_CLIENT_B)
    )
    aggregator.tick(16_000)


_SCENARIOS: dict[str, Scenario] = {
    "normal": _normal,
    "camera": _camera,
    "attention": _attention,
    "silence": _silence,
    "response": _response,
    "reaction": _reaction,
}


def run(
    scenario: str = "all",
    *,
    delay_s: float = 0.0,
    on_analysis: AnalysisEmitter = console_emit,
    on_coaching: CoachingEmitter = console_coaching_emit,
) -> None:
    names = list(_SCENARIOS) if scenario == "all" else [scenario]
    for name in names:
        print(f"\n[MVP 시나리오] {name}")
        aggregator = SessionAggregator(
            session_id=SESSION_ID,
            on_analysis=on_analysis,
            on_coaching=on_coaching,
            participant_user_ids=[USER_A, USER_B],
        )
        _SCENARIOS[name](aggregator)
        if delay_s > 0:
            time.sleep(delay_s)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="STT v2 + Vision v4 관제실 오프라인 MVP",
    )
    parser.add_argument(
        "--scenario",
        choices=["all", *_SCENARIOS],
        default="all",
    )
    parser.add_argument("--delay", type=float, default=0.0)
    args = parser.parse_args()
    run(args.scenario, delay_s=args.delay)


if __name__ == "__main__":
    main()
