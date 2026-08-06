"""AI 화상 세션 오케스트레이션 (AIVIDEO-02) — 네트워크·LiveKit 없이.

관심사는 넷이다. 턴 길이가 실제 흘려보낸 오디오와 맞는가, 바지인이 재생을 끊는가,
침묵 개입이 한 번만 나가는가, LLM·TTS가 죽어도 세션이 유지되는가.
"""

from __future__ import annotations

from typing import Iterator

import pytest

from chatbot.schemas import ChatMessage

from aggregator.voice_session import (
    SAMPLE_RATE,
    SAMPLE_WIDTH,
    SILENCE_PROMPT_MS,
    VoiceSession,
    played_ms,
)


def _pcm(ms: int) -> bytes:
    return b"\x00" * (SAMPLE_RATE * SAMPLE_WIDTH * ms // 1000)


class FakeLlm:
    def __init__(self, reply: str = "네 반가워요") -> None:
        self.reply = reply
        self.calls: list[tuple[str, int]] = []
        self.histories: list[list[tuple[str, str]]] = []

    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]:
        self.calls.append((user_text, len(history)))
        self.histories.append([(m.sender_type, m.text) for m in history])
        for token in self.reply.split():
            yield token + " "


class BrokenLlm:
    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]:
        raise RuntimeError("api down")
        yield ""  # pragma: no cover


class FakeTts:
    """문장을 100ms 청크 5개(=500ms)로 합성한다."""

    def __init__(self, chunks: int = 5) -> None:
        self.chunks = chunks
        self.texts: list[str] = []

    def synthesize(self, text: str) -> Iterator[bytes]:
        self.texts.append(text)
        for _ in range(self.chunks):
            yield _pcm(100)


class BrokenTts:
    def synthesize(self, text: str) -> Iterator[bytes]:
        raise RuntimeError("tts down")
        yield b""  # pragma: no cover


def _session(llm: object = None, tts: object = None) -> VoiceSession:
    return VoiceSession(
        llm=llm or FakeLlm(),  # type: ignore[arg-type]
        tts=tts or FakeTts(),  # type: ignore[arg-type]
        system_prompt="너는 소개팅 상대야",
    )


# ── 오디오 길이 ──────────────────────────────────────────────────────
def test_played_ms_matches_16k_mono_16bit() -> None:
    assert played_ms(len(_pcm(500))) == 500


def test_turn_duration_comes_from_bytes_not_clock() -> None:
    """시계를 쓰면 처리 지연이 턴 길이에 섞인다. 실제 흘려보낸 오디오가 정답이다."""
    session = _session()
    chunks = list(session.reply("안녕하세요", now_ms=1_000))
    assert chunks
    turn = session.turns[0]
    assert turn.started_ms == 1_000
    assert turn.ended_ms == 1_500      # 100ms × 5
    assert turn.duration_ms == 500
    assert not turn.interrupted


# ── 바지인 ───────────────────────────────────────────────────────────
def test_barge_in_stops_playback_midway() -> None:
    session = _session(tts=FakeTts(chunks=10))
    emitted = []
    for i, chunk in enumerate(session.reply("안녕", now_ms=0)):
        emitted.append(chunk)
        if i == 2:
            session.request_stop()
    assert len(emitted) == 3, "중단 요청 뒤 청크가 더 나가면 안 된다"
    turn = session.turns[0]
    assert turn.interrupted
    assert turn.ended_ms == 300, "끊긴 시점까지만 말한 것으로 기록돼야 한다"


def test_stop_flag_does_not_leak_into_next_turn() -> None:
    session = _session()
    for i, _ in enumerate(session.reply("안녕", now_ms=0)):
        if i == 0:
            session.request_stop()
    list(session.reply("다시 안녕", now_ms=5_000))
    assert session.turns[0].interrupted
    assert not session.turns[1].interrupted


# ── 침묵 개입 ────────────────────────────────────────────────────────
def test_no_opener_before_threshold() -> None:
    session = _session()
    session.note_user_speech(0)
    assert session.due_opener(SILENCE_PROMPT_MS - 1) is None


def test_opener_fires_at_threshold() -> None:
    session = _session()
    session.note_user_speech(0)
    assert session.due_opener(SILENCE_PROMPT_MS) is not None


def test_opener_fires_only_once_until_user_speaks() -> None:
    """정적마다 반복하면 AI가 혼자 떠드는 꼴이 된다."""
    session = _session()
    session.note_user_speech(0)
    assert session.due_opener(SILENCE_PROMPT_MS) is not None
    assert session.due_opener(SILENCE_PROMPT_MS + 10_000) is None
    session.note_user_speech(40_000)
    assert session.due_opener(40_000 + SILENCE_PROMPT_MS) is not None


def test_opener_is_logged_as_a_turn() -> None:
    session = _session()
    list(session.speak_opener("주말엔 뭐 하세요?", now_ms=20_000))
    assert len(session.turns) == 1
    assert session.turns[0].text == "주말엔 뭐 하세요?"


def test_ai_speech_resets_the_silence_timer() -> None:
    """AI가 말한 직후를 침묵으로 세면 곧바로 또 끼어든다."""
    session = _session()
    session.note_user_speech(0)
    list(session.speak_opener("안녕하세요", now_ms=SILENCE_PROMPT_MS))
    assert session.due_opener(SILENCE_PROMPT_MS + 1_000) is None


# ── 실패 내성 ────────────────────────────────────────────────────────
def test_llm_failure_produces_no_audio_but_keeps_session() -> None:
    session = _session(llm=BrokenLlm())
    assert list(session.reply("안녕", now_ms=0)) == []
    assert session.turns == ()          # 말한 게 없으면 턴도 없다
    assert list(session.reply("다시", now_ms=1_000)) == []


def test_tts_failure_records_nothing_and_keeps_session() -> None:
    session = _session(tts=BrokenTts())
    assert list(session.reply("안녕", now_ms=0)) == []
    assert session.turns == ()


# ── 문맥 ─────────────────────────────────────────────────────────────
def test_history_grows_so_the_ai_remembers() -> None:
    llm = FakeLlm()
    session = _session(llm=llm)
    list(session.reply("안녕하세요", now_ms=0))
    list(session.reply("취미가 뭐예요", now_ms=5_000))
    assert llm.histories[0] == []
    assert llm.histories[1] == [("user", "안녕하세요"), ("bot", "네 반가워요")]


def test_opener_is_remembered_as_ai_speech_only() -> None:
    """AI가 혼자 던진 말은 **봇 발화로** 남는다. 유저 발화로 넣으면 문맥이 오염된다."""
    llm = FakeLlm()
    session = _session(llm=llm)
    list(session.speak_opener("주말엔 뭐 하세요?", now_ms=0))
    list(session.reply("등산 가요", now_ms=3_000))
    assert llm.histories[0] == [("bot", "주말엔 뭐 하세요?")]


class SilentTts:
    """합성은 성공하지만 오디오가 없는 경우(빈 응답)."""

    def synthesize(self, text: str) -> Iterator[bytes]:
        return iter(())


def test_silent_synthesis_records_no_turn() -> None:
    """소리가 한 조각도 안 나갔으면 턴이 아니다.

    기록하면 리포트의 응답 시간이 '들린 적 없는 발화'를 기준점으로 잡는다.
    """
    session = _session(tts=SilentTts())
    assert list(session.reply("안녕", now_ms=0)) == []
    assert session.turns == ()


def test_failed_turn_does_not_pollute_history() -> None:
    """말이 안 나갔는데 이력에 넣으면 AI가 하지 않은 말을 기억한다."""
    llm = FakeLlm()
    session = _session(llm=llm, tts=SilentTts())
    list(session.reply("안녕하세요", now_ms=0))
    list(session.reply("취미가 뭐예요", now_ms=5_000))
    assert llm.histories[1] == []


def test_failed_turn_leaves_silence_timer_alone() -> None:
    """말을 못 했으면 침묵이 계속된 것이다 — 개입 타이머를 되돌려선 안 된다."""
    session = _session(tts=SilentTts())
    session.note_user_speech(0)
    list(session.reply("안녕", now_ms=1_000))
    assert session.due_opener(SILENCE_PROMPT_MS) is not None


# ── 보이스 (성별당 하나) ─────────────────────────────────────────────
def test_voice_is_pinned_per_gender() -> None:
    """성별당 하나로 고정한다. 세션마다 목소리가 바뀌면 상대가 바뀐 느낌이 든다."""
    from aggregator.voice_session import voice_for

    assert voice_for("female") != voice_for("male")
    assert voice_for("female") == voice_for("FEMALE")


def test_voice_can_be_overridden_by_env(monkeypatch: "pytest.MonkeyPatch") -> None:
    import pytest  # noqa: F401

    from aggregator.voice_session import voice_for

    monkeypatch.setenv("GMS_TTS_VOICE_FEMALE", "coral")
    assert voice_for("female") == "coral"


def test_unknown_gender_falls_back() -> None:
    from aggregator.voice_session import voice_for

    assert voice_for("nonbinary") == voice_for("female")


# ── 첫 인사 (AI가 먼저) ──────────────────────────────────────────────
def test_greeting_speaks_first_and_logs_a_turn() -> None:
    """사용자가 먼저 말하기를 기다리면 시작이 어색하다."""
    session = VoiceSession(
        llm=FakeLlm(), tts=FakeTts(), system_prompt="s",
        greeting="안녕하세요, 처음 뵙네요.",
    )
    assert b"".join(session.greet(now_ms=0))
    assert session.turns[0].text == "안녕하세요, 처음 뵙네요."


def test_greeting_does_not_call_the_llm() -> None:
    """세션 첫 소리가 API 왕복만큼 늦어지면 안 된다."""
    llm = FakeLlm()
    session = VoiceSession(
        llm=llm, tts=FakeTts(), system_prompt="s",
        greeting="안녕하세요",
    )
    list(session.greet(now_ms=0))
    assert llm.calls == []


def test_no_greeting_configured_stays_silent() -> None:
    session = _session()
    assert list(session.greet(now_ms=0)) == []
    assert session.turns == ()


def test_greeting_is_remembered_so_the_ai_stops_repeating_it() -> None:
    """인사를 이력에 안 넣으면 LLM이 방금 인사한 걸 모르고 또 인사한다(실측)."""
    llm = FakeLlm()
    session = VoiceSession(
        llm=llm, tts=FakeTts(), system_prompt="s",
        greeting="안녕하세요, 처음 뵙네요.",
    )
    list(session.greet(now_ms=0))
    list(session.reply("네 안녕하세요", now_ms=3_000))
    assert llm.histories[0] == [("bot", "안녕하세요, 처음 뵙네요.")]


def test_greeting_is_not_recorded_as_user_speech() -> None:
    llm = FakeLlm()
    session = VoiceSession(
        llm=llm, tts=FakeTts(), system_prompt="s", greeting="안녕하세요",
    )
    list(session.greet(now_ms=0))
    list(session.reply("네", now_ms=3_000))
    assert all(role == "bot" for role, _ in llm.histories[0])
