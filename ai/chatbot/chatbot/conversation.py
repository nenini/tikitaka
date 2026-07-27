"""대화 파이프라인 — 페르소나 프롬프트 + 이력 관리 + LLM 호출 (AI-DATE-01).

대화가 짧으므로 전체 이력을 컨텍스트에 주입한다(벡터DB 불필요 — v3 §11.3).
"""

from __future__ import annotations

import re
from typing import Iterator

from chatbot.llm import ChatLLM
from chatbot.persona import build_system_prompt
from chatbot.schemas import ChatMessage, PersonaSpec

# 문장 끝 부호가 이어진 덩어리를 문장 1개로 센다(예: "음..."의 마침표 3개 → 1문장).
# 캐주얼 대화는 마침표를 자주 생략하므로, 이 캡은 구두점을 붙여 장황해지는
# 응답만 잘라내고 짧은 응답은 그대로 둔다.
_SENT_END_RE = re.compile(r"[.!?。！？…]+")

# 모델이 가끔 뱉는 마크다운 강조 문자(**볼드**·#헤딩·`코드`). 채팅엔 불필요하고
# 그대로 FE로 가면 별표가 보이므로 제거한다. 캐주얼 한국어 대화에서 이 문자들이
# 정상적으로 쓰일 일은 거의 없다.
_MD_RE = re.compile(r"[*#`]+")


def _strip_markdown(stream: Iterator[str]) -> Iterator[str]:
    """토큰마다 마크다운 강조 문자를 제거. 제거 후 빈 조각은 건너뛴다."""
    for piece in stream:
        cleaned = _MD_RE.sub("", piece)
        if cleaned:
            yield cleaned


def _cap_sentences(stream: Iterator[str], max_sentences: int = 2) -> Iterator[str]:
    """스트림을 문장 N개까지만 흘려보내고 조기 종료(길이 하드캡 + 생성 조기중단)."""
    buf = ""
    for piece in stream:
        yield piece
        buf += piece
        if len(_SENT_END_RE.findall(buf)) >= max_sentences:
            break


class Conversation:
    """한 사용자의 챗봇 대화 세션. 모델은 외부에서 주입(공유)."""

    def __init__(
        self,
        llm: ChatLLM,
        persona: PersonaSpec | None = None,
        *,
        stage: str = "before",
        system_prompt: str | None = None,
    ) -> None:
        """persona(속성 조합형) 또는 system_prompt(데이터셋 페르소나 등) 중 하나로 초기화."""
        if system_prompt is None:
            if persona is None:
                raise ValueError("persona 또는 system_prompt 중 하나는 필요합니다.")
            system_prompt = build_system_prompt(persona, stage=stage)
        self.llm = llm
        self.stage = stage
        self.system_prompt = system_prompt
        self.history: list[ChatMessage] = []

    def stream_reply(self, user_text: str, *, max_sentences: int = 2) -> Iterator[str]:
        """봇 응답을 토큰 스트림으로 yield (SSE용). 이력은 바꾸지 않는다(순수).

        max_sentences로 장황한 응답을 잘라 소개팅 톤(짧은 티키타카)을 유지한다.
        """
        stream = self.llm.stream(
            system_prompt=self.system_prompt, history=self.history, user_text=user_text
        )
        return _cap_sentences(_strip_markdown(stream), max_sentences=max_sentences)

    def send(self, user_text: str) -> ChatMessage:
        """유저 메시지 전송 → 봇 응답(완성본). 이력에 유저·봇 메시지를 추가한다."""
        reply = "".join(self.stream_reply(user_text)).strip()
        bot = ChatMessage(sender_type="bot", text=reply)
        self.history.append(ChatMessage(sender_type="user", text=user_text))
        self.history.append(bot)
        return bot
