"""챗봇 LLM 어댑터 — 인터페이스 + 구현.

로컬 LLM(llama-cpp) 뒤에 `ChatLLM` 인터페이스를 둬 나중에 교체 가능하게 한다.
실제 모델 로딩은 무거우므로 `LocalAdapter`는 llama_cpp를 지연 import 한다.
단위 테스트는 `MockLLM`으로 한다(모델 불필요).
"""

from __future__ import annotations

import json
import urllib.request
from typing import Iterator, Protocol

from chatbot.schemas import ChatMessage

_ROLE = {"user": "user", "bot": "assistant"}


def to_openai_messages(
    system_prompt: str, history: list[ChatMessage], user_text: str
) -> list[dict]:
    """system + 이력 + 신규 유저 메시지 → OpenAI/llama-cpp chat 형식."""
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
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
    ) -> None:
        self.model = model
        self.host = host.rstrip("/")
        self.temperature = temperature
        self.num_predict = num_predict
        self.think = think

    def stream(
        self, *, system_prompt: str, history: list[ChatMessage], user_text: str
    ) -> Iterator[str]:
        options: dict = {"temperature": self.temperature}
        if self.num_predict is not None:
            options["num_predict"] = self.num_predict
        body: dict = {
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
        with urllib.request.urlopen(req) as resp:
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
