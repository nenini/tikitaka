"""seq 역행이 세션 결과물을 통째로 날리지 않는지 (2026-08-06 운영 장애 2건).

사슬이 이랬다.
  ① 구조적 역행 — SPEECH는 feed() 반환값으로 즉시, TRANSCRIPT는 worker 큐를 거쳐
     poll(50ms)로. 생산자·경로가 둘이라 발급 1·2·4·5가 먼저 가고 3이 나중에 온다
  ② 관제실이 예외를 던짐 → _poll_transcripts 태스크가 조용히 죽음
  ③ 전사가 쌓임 → 실시간 코칭이 문맥을 못 받음
  ④ 종료 때 한꺼번에 쏟아지며 또 예외 → _end() 중단 → 전사·리포트·실패통지 전부 유실

세 겹을 각각 막는다.
"""

from __future__ import annotations

import logging
import uuid
from itertools import count

import pytest

from aggregator.aggregator import SessionAggregator
from aggregator.events import AnalysisEvent
from stt.events import (
    SpeechStartedEvent,
    SpeechStartedPayload,
    TranscriptFinalizedEvent,
    TranscriptPayload,
)

_EVT = count(1)


def _agg() -> SessionAggregator:
    return SessionAggregator(
        "s1", on_analysis=lambda _e: None, participant_user_ids=["11"]
    )


def _ids(seq: int) -> dict[str, object]:
    next(_EVT)
    return {
        "event_id": str(uuid.uuid4()),
        "utterance_id": "11111111-1111-4111-8111-111111111111",
        "session_id": "s1",
        "user_id": "11",
        "participant_identity": "user-11",
        "client_instance_id": "22222222-2222-4222-8222-222222222222",
        "seq": seq,
    }


def _speech(seq: int, at_ms: int) -> SpeechStartedEvent:
    return SpeechStartedEvent(
        **_ids(seq),
        session_elapsed_ms=at_ms,
        confidence=0.9,
        payload=SpeechStartedPayload(observed_start_elapsed_ms=at_ms),
    )


def _transcript(seq: int, at_ms: int, text: str = "안녕하세요") -> TranscriptFinalizedEvent:
    return TranscriptFinalizedEvent(
        **_ids(seq),
        session_elapsed_ms=at_ms,
        confidence=0.9,
        payload=TranscriptPayload(
            text=text,
            language="ko",
            segment_start_ms=at_ms - 1_000,
            segment_end_ms=at_ms,
        ),
    )


# ── ① 역행이 예외가 아니다 ───────────────────────────────────────────
def test_out_of_order_seq_does_not_raise() -> None:
    """전달 순서는 구조적으로 보장되지 않는다. 예외로 막으면 세션이 통째로 죽는다."""
    agg = _agg()
    agg.push_stt_event(_speech(5, 5_000))
    agg.push_stt_event(_transcript(3, 3_000))  # 늦게 도착한 낮은 seq


def test_out_of_order_transcript_is_still_applied() -> None:
    """역행이라고 버리면 발화가 유실된다 — 리포트에서 그 말이 사라진다."""
    agg = _agg()
    agg.push_stt_event(_speech(5, 5_000))
    agg.push_stt_event(_transcript(3, 3_000, "늦게 온 발화"))
    texts = [u.text for u in agg.state.speaker("11").utterances]
    assert "늦게 온 발화" in texts


def test_out_of_order_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    """조용히 넘기면 안 된다 — 빈도가 늘면 알아야 한다."""
    agg = _agg()
    agg.push_stt_event(_speech(5, 5_000))
    with caplog.at_level(logging.WARNING):
        agg.push_stt_event(_transcript(3, 3_000))
    assert any("out of order" in r.message for r in caplog.records)


def test_baseline_keeps_the_maximum_seq() -> None:
    """늦은 낮은 seq 로 기준을 내리면 그 뒤 정상 이벤트가 전부 역행으로 보인다."""
    agg = _agg()
    agg.push_stt_event(_speech(5, 5_000))
    agg.push_stt_event(_transcript(3, 3_000))
    # 6은 5보다 크므로 정상이어야 한다(3으로 기준이 내려가지 않았다)
    agg.push_stt_event(_speech(6, 6_000))


def test_duplicate_event_id_is_still_rejected() -> None:
    """순서 검사를 푼다고 중복까지 받으면 안 된다."""
    agg = _agg()
    event = _transcript(4, 4_000)
    assert agg.push_stt_event(event) is True
    assert agg.push_stt_event(event) is False
