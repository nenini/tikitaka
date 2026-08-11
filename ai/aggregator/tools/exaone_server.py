"""OpenAI-compatible EXAONE 3.5 server for the dedicated GPU host."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = os.getenv(
    "EXAONE_MODEL_ID",
    "LGAI-EXAONE/EXAONE-3.5-7.8B-Instruct",
)
# The initial official revision is compatible with Transformers 4.43.x.
MODEL_REVISION = os.getenv(
    "EXAONE_MODEL_REVISION",
    "496aef060b296b34c6b0035149f5af9e2b8c168c",
)
MAX_INPUT_TOKENS = int(os.getenv("EXAONE_MAX_INPUT_TOKENS", "2048"))


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["system", "user", "assistant"]
    content: str


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    model: str
    messages: list[ChatMessage] = Field(min_length=1)
    temperature: float = Field(default=0.3, ge=0, le=2)
    max_tokens: int = Field(default=80, ge=1, le=128)


class LoadedExaone:
    def __init__(self) -> None:
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA GPU is required for the EXAONE server")
        self.tokenizer = AutoTokenizer.from_pretrained(
            MODEL_ID,
            revision=MODEL_REVISION,
            trust_remote_code=True,
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            revision=MODEL_REVISION,
            device_map="auto",
            torch_dtype=torch.bfloat16,
            low_cpu_mem_usage=True,
            trust_remote_code=True,
        )
        self.model.eval()

    def generate(self, request: ChatCompletionRequest) -> str:
        rendered = self.tokenizer.apply_chat_template(
            [message.model_dump() for message in request.messages],
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = self.tokenizer(
            rendered,
            return_tensors="pt",
            truncation=True,
            max_length=MAX_INPUT_TOKENS,
        ).to(self.model.device)
        with torch.inference_mode():
            output = self.model.generate(
                **inputs,
                max_new_tokens=request.max_tokens,
                do_sample=request.temperature > 0,
                temperature=max(request.temperature, 0.01),
                pad_token_id=self.tokenizer.eos_token_id,
            )
        generated = output[0, inputs["input_ids"].shape[1] :]
        return str(
            self.tokenizer.decode(
                generated,
                skip_special_tokens=True,
            )
        ).strip()


runtime: LoadedExaone | None = None


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global runtime
    runtime = LoadedExaone()
    yield
    runtime = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


app = FastAPI(title="A307 EXAONE Coaching Server", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "UP" if runtime is not None else "LOADING",
        "model": MODEL_ID,
        "revision": MODEL_REVISION,
        "cudaAvailable": torch.cuda.is_available(),
    }


@app.post("/v1/chat/completions")
async def chat_completion(
    request: ChatCompletionRequest,
) -> dict[str, object]:
    if runtime is None:
        raise HTTPException(status_code=503, detail="EXAONE is still loading")
    content = runtime.generate(request)
    if not content:
        raise HTTPException(status_code=502, detail="EXAONE returned no text")
    return {
        "id": "local-exaone",
        "object": "chat.completion",
        "model": MODEL_ID,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
    }
