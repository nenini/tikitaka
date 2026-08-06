"""AI 화상 세션 오케스트레이션 (AIVIDEO-02).

사용자가 말하면 STT 전사를 받아 LLM에 보내고, 답을 TTS로 만들어 오디오로 흘린다.
15초 침묵이면 AI가 먼저 질문하고, 사용자가 끼어들면 재생을 즉시 끊는다.

**설계상 LiveKit을 모른다.** `reply()`가 PCM 청크를 yield하고 호출자가 그걸 어디에
쓸지 정한다 — LiveKit 발행이든 파일이든 테스트든. 그래서 이 모듈은 네트워크 없이
전부 검증된다.

턴 길이는 시계가 아니라 **실제로 흘려보낸 PCM 바이트에서 계산한다.** 끼어들어 끊긴
턴은 자동으로 짧게 기록되고, 리포트의 응답 시간 계산이 정확해진다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Iterator, Protocol

from chatbot.schemas import ChatMessage

from aggregator.report.voice import AiTurn

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16_000
SAMPLE_WIDTH = 2
"""TTS·STT 공통 오디오 형식(16kHz mono 16bit). `tts.engine`과 같은 값이다."""

SILENCE_PROMPT_MS = 15_000
"""AI가 먼저 질문하기까지의 침묵. 기능명세서 §9-B.2.

리포트가 침묵을 세는 기준(`report.scoring.SILENCE_THRESHOLD_MS`=10초)과 **다른 값이고
그래야 한다.** 지표는 사람↔사람 세션과 비교 가능해야 하므로 10초를 유지하고, AI가
끼어드는 타이밍만 명세대로 15초를 쓴다. 측정 기준과 행동 기준은 별개 결정이다.
"""

_DEFAULT_VOICES = {"female": "nova", "male": "onyx"}
"""페르소나 성별 → TTS 보이스. **성별당 하나로 고정한다**(팀 결정 2026-08-05).

여러 개를 돌리면 같은 사용자가 세션마다 다른 목소리를 만나 상대가 바뀐 느낌이 든다.
`GMS_TTS_VOICE_FEMALE`·`GMS_TTS_VOICE_MALE`로 바꿀 수 있다 —
`voice_demo --voices`로 들어보고 고른 값을 넣으면 된다.
"""


def voice_for(gender: str) -> str:
    """페르소나 성별에 맞는 보이스 이름. 모르는 값이면 여성 기본값."""
    import os

    key = gender.strip().lower()
    env = f"GMS_TTS_VOICE_{key.upper()}"
    return os.environ.get(env) or _DEFAULT_VOICES.get(key, _DEFAULT_VOICES["female"])


_OPENERS = (
    "혹시 요즘 관심 있는 거 있으세요?",
    "주말엔 보통 어떻게 보내세요?",
    "아 그러면… 일은 어떤 쪽 하세요?",
)
"""침묵이 길어졌을 때 AI가 던지는 말. LLM을 부르지 않는다 —
침묵 중에 API 왕복을 기다리면 정적이 더 길어진다.
"""


class ChatLlm(Protocol):
    """`chatbot.llm.ChatLLM`과 같은 모양. 순환 의존을 만들지 않으려 여기서 다시 선언한다."""

    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]: ...


class TtsEngine(Protocol):
    """`tts.engine.TtsEngine`과 같은 모양."""

    def synthesize(self, text: str) -> Iterator[bytes]: ...


def played_ms(pcm_bytes: int) -> int:
    return pcm_bytes * 1000 // (SAMPLE_RATE * SAMPLE_WIDTH)


@dataclass
class VoiceSession:
    """한 AI 화상 세션의 대화 상태. 스레드 하나에서 순차로 쓴다."""

    llm: ChatLlm
    tts: TtsEngine
    system_prompt: str
    greeting: str | None = None
    """AI가 먼저 던지는 첫 마디. `chatbot.persona.scenario_of(code).opening`."""

    _turns: list[AiTurn] = field(default_factory=list)
    _history: list[ChatMessage] = field(default_factory=list)
    _last_activity_ms: int = 0
    _prompted_for_silence: bool = False
    _stop_requested: bool = False

    @property
    def turns(self) -> tuple[AiTurn, ...]:
        return tuple(self._turns)

    def request_stop(self) -> None:
        """진행 중인 재생을 끊는다(바지인).

        `reply()`가 다음 청크 경계에서 멈춘다. 사용자 VAD가 발화 시작을 알리면
        호출한다 — AI 문장을 끝까지 읽어주면 대화감이 깨진다.
        """
        self._stop_requested = True

    def note_user_speech(self, now_ms: int) -> None:
        """사용자가 말하고 있다는 신호. 침묵 타이머를 되돌린다."""
        self._last_activity_ms = now_ms
        self._prompted_for_silence = False

    def due_opener(self, now_ms: int) -> str | None:
        """침묵이 임계를 넘었으면 AI가 던질 말. 아니면 None.

        한 번 던지면 사용자가 말할 때까지 다시 던지지 않는다 — 정적마다 반복하면
        AI가 혼자 떠드는 꼴이 된다.
        """
        if self._prompted_for_silence:
            return None
        if now_ms - self._last_activity_ms < SILENCE_PROMPT_MS:
            return None
        self._prompted_for_silence = True
        return _OPENERS[len(self._turns) % len(_OPENERS)]

    def reply(self, user_text: str, *, now_ms: int) -> Iterator[bytes]:
        """사용자 발화 → AI 음성 청크. 턴 로그를 갱신한다.

        문장 단위로 TTS를 부른다. 답을 다 만들고 재생하면 첫 소리까지 오래 걸린다.
        """
        text = "".join(self._generate(user_text))
        yield from self._speak(text, now_ms=now_ms, remember=user_text)

    def speak_opener(self, text: str, *, now_ms: int) -> Iterator[bytes]:
        """침묵 개입 발화. LLM을 거치지 않지만 턴 로그에는 남는다."""
        yield from self._speak(text, now_ms=now_ms, remember=None)

    def greet(self, *, now_ms: int = 0) -> Iterator[bytes]:
        """세션 시작에 AI가 먼저 건네는 인사.

        사용자가 먼저 말하기를 기다리면 시작이 어색하고, 무슨 말부터 할지 모르는
        사용자는 그대로 굳는다. 실제 소개팅도 앉으면 누군가 먼저 인사한다.

        시나리오별 고정 문장이라 LLM 왕복이 없다 — 세션 첫 소리가 바로 나간다.
        """
        if self.greeting is None:
            return
        yield from self._speak(self.greeting, now_ms=now_ms, remember=None)

    def _generate(self, user_text: str) -> Iterator[str]:
        try:
            yield from self.llm.stream(
                system_prompt=self.system_prompt,
                history=list(self._history),
                user_text=user_text,
            )
        except Exception:  # noqa: BLE001 — LLM 실패로 세션을 끊지 않는다
            logger.exception("voice session llm failed")

    def _speak(
        self, text: str, *, now_ms: int, remember: str | None
    ) -> Iterator[bytes]:
        clean = text.strip()
        if not clean:
            return
        self._stop_requested = False
        sent = 0
        try:
            for chunk in self.tts.synthesize(clean):
                if self._stop_requested:
                    break
                sent += len(chunk)
                yield chunk
        except Exception:  # noqa: BLE001 — 합성 실패도 세션을 끊지 않는다
            logger.exception("voice session tts failed")
        finally:
            interrupted = self._stop_requested
            self._stop_requested = False
            if sent:
                # 소리가 한 조각도 안 나갔으면 턴이 아니다. 기록하면 리포트의 응답 시간이
                # **들린 적 없는 발화**를 기준점으로 잡는다(2026-08-05 테스트가 잡음).
                self._turns.append(
                    AiTurn(
                        index=len(self._turns) + 1,
                        text=clean,
                        started_ms=now_ms,
                        ended_ms=now_ms + played_ms(sent),
                        interrupted=interrupted,
                    )
                )
                self._last_activity_ms = now_ms + played_ms(sent)
                self._prompted_for_silence = False
                self._remember(remember, clean)

    def _remember(self, user_text: str | None, bot_text: str) -> None:
        """다음 턴의 문맥. 5분 세션이라 전체 이력을 그대로 넣는다.

        **AI 자기 발화는 사용자 발화가 없어도 기억한다.** 인사·침묵 개입을 빼먹으면
        LLM은 자기가 방금 인사한 걸 모르고 다음 턴에 또 인사한다(실측 — 첫 인사 뒤
        "안녕하세요, 반가워요!"가 다시 나왔다).

        반대로 사용자 발화는 실제로 있었을 때만 넣는다. AI가 혼자 던진 말을 유저가
        한 말로 기록하면 문맥이 오염된다.
        """
        if user_text is not None:
            self._history.append(ChatMessage(sender_type="user", text=user_text))
        self._history.append(ChatMessage(sender_type="bot", text=bot_text))
