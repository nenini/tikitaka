"""EXAONE 로 실제 대화해보기 (인터랙티브). 랜덤 한국인 페르소나로 소개팅 연습.

  uv run python -m chatbot.chat                            # 7.8b, 랜덤 상대
  uv run python -m chatbot.chat --model exaone3.5:2.4b     # 2.4b (더 빠름)
  uv run python -m chatbot.chat --sex 남자 --min-age 28 --max-age 35
  uv run python -m chatbot.chat --stage after              # 애프터 대화

종료: 빈 줄 입력 또는 /quit. 사전: ollama 실행 중 + 모델 pull + 페르소나 데이터 다운로드.
"""

from __future__ import annotations

import argparse
import random
import sys

from chatbot.conversation import Conversation
from chatbot.llm import OllamaAdapter
from chatbot.persona import (
    build_system_prompt_from_persona,
    load_personas,
    sample_persona,
)
from chatbot.schemas import ChatMessage


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

    ap = argparse.ArgumentParser(description="EXAONE 소개팅 챗봇 인터랙티브")
    ap.add_argument("--model", default="exaone3.5:7.8b", help="ollama 모델명")
    ap.add_argument("--sex", default=None, help="남자 / 여자")
    ap.add_argument("--min-age", type=int, default=None)
    ap.add_argument("--max-age", type=int, default=None)
    ap.add_argument("--stage", default="before", help="before / after")
    ap.add_argument("--seed", type=int, default=None, help="같은 상대 재현용")
    args = ap.parse_args()

    try:
        personas = load_personas()
    except FileNotFoundError as e:
        print(e)
        return

    # else 에 `random`(모듈)을 두면 Random 인스턴스가 아니라 모듈이 넘어간다.
    # 런타임엔 모듈에도 choice가 있어 돌지만 시그니처(Random | None)와 어긋난다.
    rng = random.Random(args.seed) if args.seed is not None else random.Random()
    try:
        p = sample_persona(
            personas, sex=args.sex, min_age=args.min_age, max_age=args.max_age, rng=rng
        )
    except ValueError as e:
        print(e)
        return

    print("=" * 60)
    print(f"오늘의 소개팅 상대  ·  모델: {args.model}")
    print("=" * 60)
    print(f"  {p.sex} {p.age}세 · {p.occupation}")
    print(f"  {p.persona}")
    print("-" * 60)
    print("대화를 시작하세요. (종료: 빈 줄 또는 /quit)\n")

    sp = build_system_prompt_from_persona(p, stage=args.stage)
    conv = Conversation(OllamaAdapter(args.model), system_prompt=sp)

    while True:
        try:
            user = input("나: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n(종료)")
            break
        if not user or user in ("/quit", "/exit"):
            print("(종료)")
            break

        print("상대: ", end="", flush=True)
        parts: list[str] = []
        try:
            for token in conv.stream_reply(user):
                print(token, end="", flush=True)
                parts.append(token)
        except Exception as e:  # 연결/모델 오류
            print(f"\n[오류] {e}\n(ollama 실행 중인지, 모델이 pull 됐는지 확인)")
            break
        print("\n")

        reply = "".join(parts).strip()
        conv.history.append(ChatMessage(sender_type="user", text=user))
        conv.history.append(ChatMessage(sender_type="bot", text=reply))


if __name__ == "__main__":
    main()
