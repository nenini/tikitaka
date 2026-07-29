"""STT v2 계약 fixture(JSON) 생성 — 관제실(aggregator) Python 계약 테스트용.

valid/ : 실제 이벤트 클래스로 생성(계약 100% 일치). invalid/ : 계약 위반 예시(파싱 거부되어야 함).
결정적(고정 UUID·시각)이라 커밋해 골든 파일로 쓴다.

    uv run python scripts/gen_fixtures.py   (PYTHONPATH=. 필요)
"""

from __future__ import annotations

import json
from pathlib import Path

from stt.events import (
    SpeechEndedEvent,
    SpeechEndedPayload,
    SpeechStartedEvent,
    SpeechStartedPayload,
    TranscriptFinalizedEvent,
    TranscriptPayload,
)

BASE = Path(__file__).resolve().parent.parent / "fixtures" / "v2"

# 세 이벤트가 공유하는 식별자(같은 발화)
_IDS = {
    "session_id": "session-123",
    "user_id": "123456789012345678",  # BE BIGINT를 문자열로
    "participant_identity": "participant-123",
    "client_instance_id": "ac8682da-b2f0-4fbb-86ba-9d7b3d88798c",
    "utterance_id": "6cd66154-e669-40c1-95f0-4d17554dc1a0",
}


def _valid() -> dict[str, dict[str, object]]:
    started = SpeechStartedEvent(
        **_IDS, seq=1, session_elapsed_ms=1350, confidence=0.91,
        event_id="a313bb4d-e24e-4cb5-af22-25c20b23a302",
        occurred_at="2026-07-28T10:30:01.350000+00:00",
        payload=SpeechStartedPayload(observed_start_elapsed_ms=1200),
    )
    ended = SpeechEndedEvent(
        **_IDS, seq=2, session_elapsed_ms=5900, confidence=0.89,
        event_id="83996d0b-45a3-4d42-a962-0cfde95ca4b0",
        occurred_at="2026-07-28T10:30:05.900000+00:00",
        payload=SpeechEndedPayload(
            observed_start_elapsed_ms=1200, observed_end_elapsed_ms=5200,
            speech_duration_ms=4000, termination_reason="SILENCE",
        ),
    )
    transcript = TranscriptFinalizedEvent(
        **_IDS, seq=3, session_elapsed_ms=7200, confidence=0.92,
        event_id="bfeeb008-a5e8-4f89-bd88-42c97dc00324",
        occurred_at="2026-07-28T10:30:07.200000+00:00",
        payload=TranscriptPayload(
            text="저는 영화를 보는 것을 좋아해요.", language="ko",
            segment_start_ms=1200, segment_end_ms=5200,
        ),
    )
    return {
        "speech_started": started.to_contract(),
        "speech_ended": ended.to_contract(),
        "transcript_finalized": transcript.to_contract(),
    }


def _invalid(valid: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
    started = valid["speech_started"]
    ended = valid["speech_ended"]
    transcript = valid["transcript_finalized"]
    ended_payload = dict(ended["payload"])  # type: ignore[arg-type]
    transcript_payload = dict(transcript["payload"])  # type: ignore[arg-type]
    return {
        "extra_field": {**started, "unexpectedField": "x"},          # extra=forbid 위반
        "wrong_source": {**started, "source": "WHISPER_STT"},        # SPEECH엔 source=VAD
        "nonpositive_seq": {**started, "seq": 0},                    # seq>=1 위반
        "bad_termination_reason": {                                  # 허용 안 되는 종료 이유
            **ended, "payload": {**ended_payload, "terminationReason": "NOPE"}
        },
        "blank_text": {                                              # text 공백만
            **transcript, "payload": {**transcript_payload, "text": "   "}
        },
    }


def _write(sub: str, contents: dict[str, dict[str, object]]) -> None:
    out = BASE / sub
    out.mkdir(parents=True, exist_ok=True)
    for name, obj in contents.items():
        path = out / f"{name}.json"
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path}")


def main() -> None:
    valid = _valid()
    _write("valid", valid)
    _write("invalid", _invalid(valid))


if __name__ == "__main__":
    main()
