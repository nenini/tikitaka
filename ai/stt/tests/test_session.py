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


def test_close_returns_events_in_ascending_seq(monkeypatch: pytest.MonkeyPatch) -> None:
    """close()가 돌려주는 이벤트의 seq는 오름차순이어야 한다.

    관제실이 seq 역행을 SttSequenceError로 거부한다(aggregator.py:151). 종료 처리가
    거기서 터지면 **전사 보관·리포트 생성이 통째로 스킵된다** —
    2026-08-06 운영 세션에서 `received 232, previous 682`로 실제 발생했고,
    30분 세션의 리포트가 아예 안 만들어졌다.

    재현 조건: 완료된 전사가 아직 안 꺼내진 채로(=poll 루프가 취소된 뒤) 진행 중인
    발화가 남아 종료되는 경우. flush()가 **새** seq를 받고, 그 뒤에 붙는 전사는
    **먼저 발급된** seq를 갖는다.
    """
    # 첫 발화는 끝나게, 두 번째는 진행 중으로 남게 VAD를 바꿔 준다.
    mode = {"open": False}

    def fake_vad(buf: object, opts: object) -> list[dict[str, int]]:
        length = len(buf)  # type: ignore[arg-type]
        return [{"start": 0, "end": length if mode["open"] else 8000}]

    monkeypatch.setattr(session_mod, "get_speech_timestamps", fake_vad)
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())

    runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(8000, dtype=np.float32))
    runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(12000, dtype=np.float32))
    assert runner.wait_idle()  # 전사가 큐에 쌓였지만 poll 하지 않는다

    mode["open"] = True
    runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(8000, dtype=np.float32))
    final = runner.close()

    seqs = [e.seq for e in final]
    assert seqs == sorted(seqs), f"seq 역행: {[(e.seq, e.event_type) for e in final]}"
    assert runner.poll_transcripts() == []


# ── 트랙 종료·음소거 시 화자별 flush (2026-08-06 운영: is_speaking 고착) ──

def test_flush_speaker_closes_in_flight_speech(monkeypatch: pytest.MonkeyPatch) -> None:
    """음소거는 구독을 끊지 않는다. 프레임만 멈추므로 VAD 는 발화 끝을 볼 기회가 없다.

    마감하지 않으면 SPEECH_ENDED 가 영영 안 나가고, 관제실의 is_speaking 이 True 로
    고착돼 세션 내내 침묵 코칭이 죽는다.
    """
    _patch_vad(monkeypatch, start=0, end=8000)
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(8000, dtype=np.float32))

    events = runner.flush_speaker("42")
    assert runner.wait_idle()
    transcripts = runner.poll_transcripts()
    runner.close()

    assert [e.event_type for e in events] == ["SPEECH_ENDED"]
    ended = events[0]
    assert isinstance(ended, SpeechEndedEvent)
    assert ended.payload.termination_reason == "TRACK_ENDED"
    assert [t.event_type for t in transcripts] == ["TRANSCRIPT_FINALIZED"]


def test_flush_speaker_is_idle_when_nobody_is_speaking(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """음소거 이벤트는 발화 중이 아닐 때도 온다 — 빈 이벤트를 만들면 안 된다."""
    _patch_vad(monkeypatch, start=0, end=8000)
    runner = SessionSttRunner(FakeEngine(), session_id="s1", vad_opts=make_vad_options())
    assert runner.flush_speaker("42") == []       # 스트림 자체가 없는 경우
    runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(8000, dtype=np.float32))
    runner.feed(user_id="42", participant_identity="lk-42", audio=np.zeros(12000, dtype=np.float32))
    assert runner.flush_speaker("42") == []       # 이미 정상 종료된 경우
    runner.close()


def test_session_end_flush_still_says_session_ended(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """reason 인자를 추가하면서 기존 종료 경로가 바뀌지 않았는지."""
    _patch_vad(monkeypatch, start=0, end=8000)
    s = _stream()
    s.feed(np.zeros(8000, dtype=np.float32))
    events = s.flush()
    assert isinstance(events[0], SpeechEndedEvent)
    assert events[0].payload.termination_reason == "SESSION_ENDED"
