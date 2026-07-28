"""EXAONE 2.4b vs 7.8b 비교 — 같은 페르소나로 응답 품질 + 속도(첫응답·tok/s) 측정.

같은 한국인 페르소나(고정 seed)로 두 모델에 같은 질문을 던져 말투/내용 차이와 속도를 본다.

  uv run python scripts/benchmark_models.py
"""

from __future__ import annotations

import json
import random
import sys
import time
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from chatbot.llm import to_openai_messages  # noqa: E402
from chatbot.persona import (  # noqa: E402
    build_system_prompt_from_persona,
    load_personas,
    sample_persona,
)
from chatbot.schemas import ChatMessage  # noqa: E402

HOST = "http://localhost:11434"
MODELS = ["exaone3.5:2.4b", "exaone3.5:7.8b"]
USER_TURNS = ["안녕하세요! 오늘 처음 뵙네요 :)", "주말엔 보통 뭐 하면서 지내세요?"]


def chat_once(model: str, system_prompt: str, history: list[ChatMessage], user_text: str) -> dict:
    payload = json.dumps(
        {
            "model": model,
            "messages": to_openai_messages(system_prompt, history, user_text),
            "stream": True,
            "options": {"temperature": 0.8},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{HOST}/api/chat", data=payload, headers={"Content-Type": "application/json"}
    )
    t0 = time.perf_counter()
    ttft = None
    parts: list[str] = []
    stats: dict = {}
    with urllib.request.urlopen(req) as resp:
        for raw in resp:
            raw = raw.strip()
            if not raw:
                continue
            obj = json.loads(raw)
            piece = obj.get("message", {}).get("content")
            if piece:
                if ttft is None:
                    ttft = time.perf_counter() - t0
                parts.append(piece)
            if obj.get("done"):
                stats = obj
    tok = stats.get("eval_count", 0)
    gen_s = stats.get("eval_duration", 0) / 1e9
    return {
        "text": "".join(parts).strip(),
        "ttft": ttft or 0.0,
        "tok": tok,
        "gen_s": gen_s,
        "toks": (tok / gen_s) if gen_s else 0.0,
    }


def main() -> None:
    personas = load_personas()
    rng = random.Random(42)
    picks = [
        sample_persona(personas, sex="여자", min_age=25, max_age=32, rng=rng),
        sample_persona(personas, sex="남자", min_age=28, max_age=36, rng=rng),
    ]

    for p in picks:
        sp = build_system_prompt_from_persona(p)
        print("=" * 72)
        print(f"페르소나: {p.sex} {p.age}세 · {p.occupation}")
        print(f"  취미: {p.hobbies_and_interests[:90]}")
        print("=" * 72)
        for model in MODELS:
            print(f"\n▶ [{model}]")
            history: list[ChatMessage] = []
            runs = []
            for ut in USER_TURNS:
                r = chat_once(model, sp, history, ut)
                print(f"  🙋 {ut}")
                print(f"  🤖 {r['text']}")
                print(f"     ⏱ 첫응답 {r['ttft']:.1f}s · 생성 {r['gen_s']:.1f}s · {r['toks']:.1f} tok/s")
                history.append(ChatMessage(sender_type="user", text=ut))
                history.append(ChatMessage(sender_type="bot", text=r["text"]))
                runs.append(r)
            avg_ttft = sum(x["ttft"] for x in runs) / len(runs)
            avg_toks = sum(x["toks"] for x in runs) / len(runs)
            print(f"  ⇒ 평균: 첫응답 {avg_ttft:.1f}s · {avg_toks:.1f} tok/s")
        print()


if __name__ == "__main__":
    main()
