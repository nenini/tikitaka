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
import logging
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
from chatbot.llm import ChatLLM, GmsChatAdapter, GmsChatConfigError, OllamaAdapter
from chatbot.persona import build_system_prompt
from chatbot.persona_catalog import PersonaNotFound, get_persona, select_partner
from chatbot.queue_gate import LlmGate, QueueFull, QueueTimeout, gate_from_env
from chatbot.schemas import ChatMessage

logger = logging.getLogger(__name__)

_TOKEN_ENV = "AI_CHAT_INTERNAL_TOKEN"

HEARTBEAT_SECONDS = 10.0
"""대기 중 heartbeat 간격.

아무것도 안 보내면 nginx가 죽은 연결로 보고 끊는다(BE 계약 2026-08-05).
BE의 전체 제한 시간을 무한 연장하는 용도가 아니라, 살아 있음만 알린다.
"""


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
    """기본은 GMS(OpenAI 호환), 키가 없으면 로컬 Ollama.

    로컬 EXAONE 7.8B 는 6GB GPU 에 다 안 올라가 일부가 CPU 로 넘어간다. 실측(2026-08-09,
    10턴): **평균 62초, 첫 응답은 120초 타임아웃으로 실패**했다. 채팅에서는 못 쓰는 속도다.

    `CHATBOT_LLM_BACKEND=ollama` 를 주면 강제로 로컬을 쓴다 — GPU 서버에 여유가 있거나
    외부 호출을 막아야 할 때를 위해 남겨 둔다.

    ⚠️ GMS 를 쓰면 **대화 원문이 외부로 나간다.** AI 연습 대화(사람 상대가 없는 세션)에
       한해 허용한 팀 결정(2026-08-05)을 따른다. 사람 간 화상 세션의 전사는 여전히
       외부로 나가지 않는다.
    """
    backend = os.environ.get("CHATBOT_LLM_BACKEND", "gms").strip().lower()
    if backend != "ollama":
        try:
            return GmsChatAdapter.from_env()
        except GmsChatConfigError:
            logger.warning(
                "GMS 설정이 없어 로컬 Ollama 로 폴백합니다 "
                "(GMS_BASE_URL·GMS_API_KEY 확인). 응답이 크게 느려집니다."
            )
    # 컨테이너에선 호스트 Ollama를 가리켜야 함(OLLAMA_HOST). 모델도 env로 교체 가능
    # (GPU 여유에 따라 7.8B ↔ 2.4B 전환 등). 미설정 시 로컬 기본값.
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    model = os.environ.get("OLLAMA_MODEL", "exaone3.5:7.8b")
    timeout = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "120"))
    return OllamaAdapter(model=model, host=host, timeout_seconds=timeout)


LLMDep = Annotated[ChatLLM, Depends(get_llm)]

_gate = gate_from_env()


def get_gate() -> LlmGate:
    return _gate


GateDep = Annotated[LlmGate, Depends(get_gate)]

app = FastAPI(title="소개팅 AI 챗봇 API", version="0.4.0")


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
    gate: GateDep,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> Response:
    _check_token(x_internal_token)

    # 대기열 자리는 **스트림을 열기 전에** 잡는다. 200을 내보낸 뒤에는 503을 못 준다.
    try:
        ticket = gate.enter()
    except QueueFull:
        return JSONResponse(
            status_code=503,
            content={
                "code": "AI_QUEUE_FULL",
                "message": "AI 응답 대기열이 가득 찼습니다. 잠시 후 다시 시도해 주세요.",
            },
            headers={"Retry-After": "10"},
        )

    def generate() -> Iterator[bytes]:
        try:
            # 1) 페르소나 결정 — GPU를 안 쓰므로 대기 전에 끝낸다.
            #    조건이 틀렸으면 자리를 붙잡고 기다릴 이유가 없다.
            try:
                if request.selected_persona_key:
                    entry = get_persona(request.selected_persona_key)
                    emit_persona = False
                else:
                    condition = request.persona_condition or PersonaCondition()
                    # ⚠️ `preferredGender` 에는 **사용자 본인의 성별**이 온다.
                    #    BE(AiChatContextService)가 profile.getGender() 를 그대로 담기
                    #    때문이다 — 필드 이름과 내용이 어긋나 있다. 그대로 넘기면 동성
                    #    페르소나가 나오므로 select_partner 로 뒤집어서 고른다.
                    #    계약을 바로잡으면(BE가 반대 성별을 담으면) select_persona 로
                    #    되돌리고 이 주석을 지운다.
                    entry = select_partner(
                        condition.preferred_gender,
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

            # 2) LLM 자리를 기다린다. 기다리는 동안 heartbeat로 연결을 살려 둔다.
            if not ticket.acquired:
                yield _sse("queued", {"position": ticket.position})
            try:
                while not ticket.wait(HEARTBEAT_SECONDS):
                    yield _sse("heartbeat", {"status": "QUEUED"})
            except QueueTimeout:
                yield _sse("error", {
                    "code": "AI_QUEUE_TIMEOUT",
                    "message": "AI 응답 대기 시간이 초과되었습니다.",
                })
                return

            yield _sse("started", {"sessionId": request.session_id})

            # 3) history로 문맥 구성 후 답변 생성 (무상태)
            system_prompt = build_system_prompt(entry.spec, stage="before")
            prior, user_text = _prior_and_input(request.history)
            conversation = Conversation(llm, system_prompt=system_prompt)
            conversation.history = prior
            sequence = 0
            try:
                for token in conversation.stream_reply(user_text):
                    sequence += 1
                    yield _sse("chunk", {"sequence": sequence, "content": token})
            except Exception:  # noqa: BLE001 — 스트림 도중 실패는 event: error로
                yield _sse("error", {
                    "code": "AI_RESPONSE_GENERATION_FAILED",
                    "message": "AI 응답 생성에 실패했습니다.",
                })
                return

            yield _sse("done", {"sessionId": request.session_id, "personaKey": entry.key})
        finally:
            # 클라이언트가 중간에 끊어도 여기를 지난다(GeneratorExit). 자리를 안 놓으면
            # 대기열이 영구히 막힌다.
            ticket.release()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
