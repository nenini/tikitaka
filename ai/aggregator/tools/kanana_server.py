"""OpenAI-compatible Kanana server for local and dedicated GPU hosts."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Literal

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

MODEL_ID = os.getenv("KANANA_MODEL_ID", "kakaocorp/kanana-2-3b-instruct")
MAX_INPUT_TOKENS = int(os.getenv("KANANA_MAX_INPUT_TOKENS", "2048"))
LOAD_IN_4BIT = os.getenv("KANANA_LOAD_IN_4BIT", "true").lower() in {
    "1", "true", "yes", "on"
}
TRUST_REMOTE_CODE = os.getenv(
    "KANANA_TRUST_REMOTE_CODE",
    "false",
).lower() in {"1", "true", "yes", "on"}


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


class LoadedKanana:
    def __init__(self) -> None:
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA GPU is required for this Kanana server")
        quantization_config = (
            BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            )
            if LOAD_IN_4BIT
            else None
        )
        self.tokenizer = AutoTokenizer.from_pretrained(
            MODEL_ID,
            trust_remote_code=TRUST_REMOTE_CODE,
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            device_map="auto",
            torch_dtype="auto",
            quantization_config=quantization_config,
            low_cpu_mem_usage=True,
            trust_remote_code=TRUST_REMOTE_CODE,
        )
        self.model.eval()

    def generate(self, request: ChatCompletionRequest) -> str:
        rendered = self.tokenizer.apply_chat_template(
            [message.model_dump() for message in request.messages],
            tokenize=False,
            add_generation_prompt=True,
            thinking_mode="no_think",
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
        return self.tokenizer.decode(generated, skip_special_tokens=True).strip()


runtime: LoadedKanana | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global runtime
    runtime = LoadedKanana()
    yield
    runtime = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


app = FastAPI(title="A307 Local Kanana Server", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "UP" if runtime is not None else "LOADING",
        "model": MODEL_ID,
        "quantized4Bit": LOAD_IN_4BIT,
        "trustRemoteCode": TRUST_REMOTE_CODE,
        "cudaAvailable": torch.cuda.is_available(),
    }


@app.post("/v1/chat/completions")
async def chat_completion(request: ChatCompletionRequest) -> dict[str, object]:
    if runtime is None:
        raise HTTPException(status_code=503, detail="Kanana is still loading")
    content = runtime.generate(request)
    if not content:
        raise HTTPException(status_code=502, detail="Kanana returned no text")
    return {
        "id": "local-kanana",
        "object": "chat.completion",
        "model": MODEL_ID,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
    }
