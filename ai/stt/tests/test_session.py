"""화자별 스트림 v2 이벤트 흐름 테스트 (요구사항.md) — VAD 패치·mock 엔진."""

from typing import Any

import numpy as np
import pytest

from stt import session as session_mod
from stt.events import SpeechEndedEvent, SpeechStartedEvent
from stt.pipeline import TranscriptPiece
from stt.session import SessionSttRunner, SpeakerStream, make_vad_options


class FakeEngine:
    def transcribe_chunk(
        self, audio: np.ndarray, *, base_ms: int = 0, vad_filter: bool = False, min_confidence: float = 0.5
    ) -> list[TranscriptPiece]:
        return [TranscriptPiece("발화", 0.9, base_ms, base_ms + 500, "ko")]


def _patch_vad(monkeypatch: pytest.MonkeyPatch, *, start: int, end: int) -> None:
    monkeypatch.setattr(
        session_mod, "get_speech_timestamps", lambda buf, opts: [{"start": start, "end": end}]
    )


def _stream(engine: Any = None, **over: Any) -> SpeakerStream:
    kw: dict[str, Any] = dict(
        session_id="s1", user_id="42", participant_identity="lk-42", vad_opts=make_vad_options()
    )
    kw.update(over)
    return SpeakerStream(engine or FakeEngine(), **kw)


# ── 동기 모드(SpeakerStream 직접) — feed가 SPEECH + TRANSCRIPT 반환 ──

def test_onset_emits_speech_started(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    e1 = _stream().feed(np.zeros(8000, dtype=np.float32))
    assert [e.event_type for e in e1] == ["SPEECH_STARTED"]


def test_endpoint_emits_ended_and_transcript(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    s = _stream()
    s.feed(np.zeros(8000, dtype=np.float32))
    e2 = s.feed(np.zeros(12000, dtype=np.float32))
    assert [e.event_type for e in e2] == ["SPEECH_ENDED", "TRANSCRIPT_FINALIZED"]


def test_unified_seq_sync(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    s = _stream()
    a = s.feed(np.zeros(8000, dtype=np.float32))
    b = s.feed(np.zeros(12000, dtype=np.float32))
    assert [e.seq for e in a + b] == [1, 2, 3]  # 종류 무관 통합 증가


def test_shared_utterance_id(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    s = _stream()
    a = s.feed(np.zeros(8000, dtype=np.float32))
    b = s.feed(np.zeros(12000, dtype=np.float32))
    uid = a[0].utterance_id
    assert uid and all(e.utterance_id == uid for e in a + b)


def test_timing_observed_vs_created(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    s = _stream(stream_epoch_ms=180_000)  # 세션 3분 후 입장
    a = s.feed(np.zeros(8000, dtype=np.float32))
    b = s.feed(np.zeros(12000, dtype=np.float32))
    started = a[0]
    assert isinstance(started, SpeechStartedEvent)
    assert started.session_elapsed_ms == 180_500                 # 생성 시각(오디오 위치)
    assert started.payload.observed_start_elapsed_ms == 180_000  # 실제 발화 시작
    ended = b[0]
    assert isinstance(ended, SpeechEndedEvent)
    assert ended.payload.observed_end_elapsed_ms == 180_500      # 마지막 음성
    assert ended.payload.speech_duration_ms == 500
    assert ended.payload.termination_reason == "SILENCE"


def test_contract_camelcase(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    s = _stream()
    s.feed(np.zeros(8000, dtype=np.float32))
    b = s.feed(np.zeros(12000, dtype=np.float32))
    d = b[1].to_contract()  # TRANSCRIPT_FINALIZED
    assert d["eventType"] == "TRANSCRIPT_FINALIZED"
    assert d["kind"] == "transcript"
    assert d["source"] == "WHISPER_STT"
    assert d["clientInstanceId"]
    assert d["userId"] == "42"
    assert "client_instance_id" not in d


# ── 비동기 모드(SessionSttRunner + worker) ─────────────────────────

def test_runner_async_transcript(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    e1 = runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(8000, dtype=np.float32))
    e2 = runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(12000, dtype=np.float32))
    assert [e.event_type for e in e1] == ["SPEECH_STARTED"]
    assert [e.event_type for e in e2] == ["SPEECH_ENDED"]  # 전사는 비동기
    assert runner.wait_idle()
    transcripts = runner.poll_transcripts()
    runner.close()
    assert [t.event_type for t in transcripts] == ["TRANSCRIPT_FINALIZED"]
    assert transcripts[0].seq == 3       # STARTED=1, ENDED=2, TRANSCRIPT=3 통합 seq
    assert transcripts[0].user_id == "42"


def test_runner_withdraw_stops_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(8000, dtype=np.float32))
    runner.withdraw("42")
    after = runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(12000, dtype=np.float32))
    assert runner.wait_idle()
    transcripts = runner.poll_transcripts()
    runner.close()
    assert after == []            # 철회 후 feed no-op
    assert transcripts == []       # 전사도 폐기


def test_runner_close_flushes_inprogress(monkeypatch: pytest.MonkeyPatch) -> None:
    """close()가 진행 중 발화를 끝내고 **전사까지 함께** 돌려줘야 한다.

    close()가 SPEECH_ENDED만 돌려주면 세션 마지막 발화의 전사가 worker 출력 큐에
    남아 그대로 유실된다(2026-08-04 실측 — 고정 오디오 6개에서 전사 7건 전부 사라졌다).
    호출자가 close() 뒤에 poll_transcripts()를 또 부르게 만들면 잊어버린다.
    """
    _patch_vad(monkeypatch, start=0, end=8000)
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    e1 = runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(8000, dtype=np.float32))
    assert [e.event_type for e in e1] == ["SPEECH_STARTED"]  # 진행 중
    final = runner.close()          # flush → SESSION_ENDED + 전사
    assert [e.event_type for e in final] == ["SPEECH_ENDED", "TRANSCRIPT_FINALIZED"]
    # close()가 다 돌려줬으므로 뒤에 또 꺼낼 게 없어야 한다
    assert runner.poll_transcripts() == []
    ended = final[0]
    assert isinstance(ended, SpeechEndedEvent)
    assert ended.payload.termination_reason == "SESSION_ENDED"


def test_runner_routes_by_user(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_vad(monkeypatch, start=0, end=8000)
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    a = runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(8000, dtype=np.float32))
    b = runner.feed(user_id="43", participant_identity="lk-43", audio=np.zeros(8000, dtype=np.float32))
    assert a[0].user_id == "42"
    assert b[0].user_id == "43"
    runner.close()
