"""챗봇 LLM 어댑터 — 인터페이스 + 구현.

로컬 LLM(llama-cpp) 뒤에 `ChatLLM` 인터페이스를 둬 나중에 교체 가능하게 한다.
실제 모델 로딩은 무거우므로 `LocalAdapter`는 llama_cpp를 지연 import 한다.
단위 테스트는 `MockLLM`으로 한다(모델 불필요).
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Iterator, Protocol

import httpx

from chatbot.schemas import ChatMessage

_ROLE = {"user": "user", "bot": "assistant"}


def to_openai_messages(
    system_prompt: str, history: list[ChatMessage], user_text: str
) -> list[dict[str, str]]:
    """system + 이력 + 신규 유저 메시지 → OpenAI/llama-cpp chat 형식."""
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for m in history:
        messages.append({"role": _ROLE.get(m.sender_type, "user"), "content": m.text})
    messages.append({"role": "user", "content": user_text})
    return messages


class ChatLLM(Protocol):
    """토큰을 스트리밍으로 yield 하는 챗 LLM."""

    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]: ...


class MockLLM:
    """테스트/개발용 — 실제 추론 없이 고정 응답을 토큰처럼 흘려보낸다."""

    def __init__(self, reply: str = "네, 반가워요") -> None:
        self._reply = reply

    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]:
        for token in self._reply.split():
            yield token + " "


class OllamaAdapter:
    """Ollama HTTP API 기반 로컬 LLM (Windows에서 llama-cpp 빌드 없이 사용).

    사전: `ollama pull exaone3.5:7.8b` 등으로 모델 준비 + ollama 실행 중.
    """

    def __init__(
        self,
        model: str = "exaone3.5:7.8b",
        *,
        host: str = "http://localhost:11434",
        temperature: float = 0.8,
        num_predict: int | None = 64,   # 응답 최대 토큰(길이 하드캡). None=제한없음
        think: bool | None = None,      # 하이브리드 추론 모델(Qwen3 등) 사고 on/off. None=미전송
        timeout_seconds: float = 120.0,
    ) -> None:
        self.model = model
        self.host = host.rstrip("/")
        self.temperature = temperature
        self.num_predict = num_predict
        self.think = think
        self.timeout_seconds = timeout_seconds
        """소켓 타임아웃. **없으면 무한 대기다.**

        타임아웃이 없으면 Ollama가 멎었을 때 그 요청이 영원히 스레드를 붙잡는다.
        쌓이면 스레드풀이 말라 새 요청을 아예 못 받는다.

        120초는 BE와 합의한 '생성 최대 시간'이다(계약 2026-08-05). 전체 시간 예산:
        대기 120 + 생성 120 = 240 < BE 요청 270 < BE SSE 300 < nginx 3600.
        """

    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]:
        options: dict[str, object] = {"temperature": self.temperature}
        if self.num_predict is not None:
            options["num_predict"] = self.num_predict
        body: dict[str, object] = {
            "model": self.model,
            "messages": to_openai_messages(system_prompt, history, user_text),
            "stream": True,
            "options": options,
        }
        if self.think is not None:
            body["think"] = self.think  # 캐주얼 대화는 think=False 권장(빠르고 담백)
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"{self.host}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
            for raw in resp:
                raw = raw.strip()
                if not raw:
                    continue
                obj = json.loads(raw)
                piece = obj.get("message", {}).get("content")
                if piece:
                    yield piece
                if obj.get("done"):
                    break


class GmsChatAdapter:
    """SSAFY GMS(OpenAI 호환) 채팅 — AI 화상 세션용.

    TTS(`tts.gms.GmsTtsEngine`)와 **같은 `GMS_BASE_URL`·`GMS_API_KEY`를 쓴다.**
    `GMS_BASE_URL`은 `/v1`까지 포함한 값을 기대한다(TTS와 같은 규약).

    로컬 EXAONE 대신 이걸 쓰는 이유는 음성 대화의 지연이다. 7.8B를 GPU에서 돌리면
    Whisper와 경합하고, 첫 토큰까지의 시간이 체감 품질을 그대로 좌우한다.

    ⚠️ 대화 원문이 외부로 나간다. 팀 결정(2026-08-05)으로 AI 연습 세션에서는 허용한다.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str = "gpt-4o-mini",
        temperature: float = 0.8,
        max_tokens: int = 120,
        timeout_seconds: float = 30.0,
        client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout_seconds = timeout_seconds
        self._client = client

    @classmethod
    def from_env(cls, **over: object) -> GmsChatAdapter:
        """`ai/tts/.env`를 함께 읽는다 — 키를 두 곳에 두지 않기 위해서다."""
        from pathlib import Path

        from dotenv import load_dotenv

        load_dotenv(
            Path(__file__).resolve().parents[2] / "tts" / ".env", override=False
        )
        base_url = os.environ.get("GMS_BASE_URL", "").strip()
        api_key = os.environ.get("GMS_API_KEY", "").strip()
        if not base_url or not api_key:
            raise GmsChatConfigError(
                "GMS_BASE_URL·GMS_API_KEY 환경변수가 필요합니다."
            )
        kwargs: dict[str, object] = {
            "base_url": base_url,
            "api_key": api_key,
            "model": os.environ.get("GMS_CHAT_MODEL", "gpt-4o-mini"),
        }
        kwargs.update(over)
        return cls(**kwargs)  # type: ignore[arg-type]

    @property
    def endpoint(self) -> str:
        return f"{self.base_url}/chat/completions"

    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]:
        body = {
            "model": self.model,
            "messages": to_openai_messages(system_prompt, history, user_text),
            "stream": True,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        client = self._client or httpx.Client(timeout=self.timeout_seconds)
        owned = self._client is None
        try:
            with client.stream(
                "POST", self.endpoint, headers=headers, json=body
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    piece = _sse_delta(line)
                    if piece:
                        yield piece
        finally:
            if owned:
                client.close()


class GmsChatConfigError(RuntimeError):
    """GMS 설정이 없다."""


def _sse_delta(line: str) -> str | None:
    """OpenAI 스트리밍 한 줄 → 토큰. 데이터가 아니면 None.

    `data: [DONE]`과 빈 줄, 주석(`:`)을 건너뛴다. JSON이 깨진 줄은 무시한다 —
    한 줄 때문에 대화 전체를 끊을 이유가 없다.
    """
    stripped = line.strip()
    if not stripped.startswith("data:"):
        return None
    payload = stripped[len("data:") :].strip()
    if not payload or payload == "[DONE]":
        return None
    try:
        chunk = json.loads(payload)
    except json.JSONDecodeError:
        return None
    choices = chunk.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    delta = choices[0].get("delta")
    if not isinstance(delta, dict):
        return None
    content = delta.get("content")
    return content if isinstance(content, str) and content else None


class LocalAdapter:
    """llama-cpp-python 기반 로컬 LLM (대안). Windows는 OllamaAdapter 권장."""

    def __init__(self, model_path: str, *, n_ctx: int = 4096, n_gpu_layers: int = -1) -> None:
        from llama_cpp import Llama  # 지연 import — 미설치 시 여기서만 실패

        self._llm = Llama(model_path=model_path, n_ctx=n_ctx, n_gpu_layers=n_gpu_layers)

    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]:
        messages = to_openai_messages(system_prompt, history, user_text)
        for chunk in self._llm.create_chat_completion(messages=messages, stream=True):
            delta = chunk["choices"][0]["delta"].get("content")
            if delta:
                yield delta
