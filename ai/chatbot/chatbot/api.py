"""챗봇 HTTP API (FastAPI) — BE ↔ AI 스트리밍 계약 (무상태).

BE가 `{userId, sessionId, purpose, personaCondition, selectedPersonaKey, history}`를
POST로 보내면, AI는 SSE로 응답한다:
  - 첫 요청(selectedPersonaKey=null): 조건으로 페르소나 선택 → `event: persona`(키·표시명)
  - 이어서 `event: chunk`(답변 조각) × N → `event: done`(personaKey)
  - 실패: `event: error`(PERSONA_NOT_FOUND / AI_RESPONSE_GENERATION_FAILED)

무상태: AI는 세션을 보관하지 않는다. 대화 문맥은 매 요청의 history로 받는다.
페르소나는 personaKey로 항상 재구성 가능(persona_catalog).

실행:
    uv run uvicorn chatbot.api:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from starlette.requests import Request
from starlette.responses import Response

from chatbot.conversation import Conversation
from chatbot.llm import ChatLLM, OllamaAdapter
from chatbot.persona import build_system_prompt
from chatbot.persona_catalog import PersonaNotFound, get_persona, select_persona
from chatbot.schemas import ChatMessage

_TOKEN_ENV = "AI_CHAT_INTERNAL_TOKEN"


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HistoryMessage(_CamelModel):
    sequence_no: int
    role: str                       # USER | AI
    content: str


class PersonaCondition(_CamelModel):
    preferred_gender: str | None = None
    preferred_age: int | None = None
    min_preferred_age: int | None = None
    max_preferred_age: int | None = None


class ChatStreamRequest(_CamelModel):
    user_id: int
    session_id: int
    purpose: str | None = None
    persona_condition: PersonaCondition | None = None
    selected_persona_key: str | None = None
    history: list[HistoryMessage] = Field(default_factory=list)


def get_llm() -> ChatLLM:
    # 컨테이너에선 호스트 Ollama를 가리켜야 함(OLLAMA_HOST). 모델도 env로 교체 가능
    # (GPU 여유에 따라 7.8B ↔ 2.4B 전환 등). 미설정 시 로컬 기본값.
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    model = os.environ.get("OLLAMA_MODEL", "exaone3.5:7.8b")
    timeout = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "45"))
    return OllamaAdapter(model=model, host=host, timeout_seconds=timeout)


LLMDep = Annotated[ChatLLM, Depends(get_llm)]

app = FastAPI(title="소개팅 AI 챗봇 API", version="0.3.0")


@app.exception_handler(RequestValidationError)
async def _on_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"code": "INVALID_AI_CHAT_REQUEST", "message": "요청 형식이 올바르지 않습니다."},
    )


def _check_token(token: str | None) -> None:
    expected = os.environ.get(_TOKEN_ENV)
    if expected and token != expected:  # 토큰 미설정(개발)이면 검사 생략
        raise HTTPException(status_code=401, detail="Invalid internal token")


def _sse(event: str, data: dict[str, object]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def _prior_and_input(history: list[HistoryMessage]) -> tuple[list[ChatMessage], str]:
    """history를 (직전 이력, 이번 유저 입력)으로 분리. 마지막 메시지가 이번 입력."""
    messages = [
        ChatMessage(sender_type="user" if h.role.upper() == "USER" else "bot", text=h.content)
        for h in history
    ]
    if not messages:
        return [], ""
    return messages[:-1], messages[-1].text


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/chat/stream")
def stream_chat(
    request: ChatStreamRequest,
    llm: LLMDep,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> Response:
    _check_token(x_internal_token)

    def generate() -> Iterator[bytes]:
        # 1) 페르소나 결정 (키 있으면 재사용, 없으면 조건으로 선택)
        try:
            if request.selected_persona_key:
                entry = get_persona(request.selected_persona_key)
                emit_persona = False
            else:
                condition = request.persona_condition or PersonaCondition()
                entry = select_persona(
                    gender=condition.preferred_gender,
                    age=condition.preferred_age,
                    min_age=condition.min_preferred_age,
                    max_age=condition.max_preferred_age,
                )
                emit_persona = True
        except PersonaNotFound:
            yield _sse("error", {
                "code": "PERSONA_NOT_FOUND",
                "message": "조건에 맞는 페르소나를 찾을 수 없습니다.",
            })
            return

        if emit_persona:
            yield _sse("persona", {"personaKey": entry.key, "displayName": entry.display_name})

        # 2) history로 문맥 구성 후 답변 생성 (무상태)
        system_prompt = build_system_prompt(entry.spec, stage="before")
        prior, user_text = _prior_and_input(request.history)
        conversation = Conversation(llm, system_prompt=system_prompt)
        conversation.history = prior
        try:
            for token in conversation.stream_reply(user_text):
                yield _sse("chunk", {"content": token})  # 생성 즉시 flush
        except Exception:  # noqa: BLE001 — 스트림 도중 실패는 event: error로
            yield _sse("error", {
                "code": "AI_RESPONSE_GENERATION_FAILED",
                "message": "AI 응답 생성에 실패했습니다.",
            })
            return

        yield _sse("done", {"personaKey": entry.key})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
