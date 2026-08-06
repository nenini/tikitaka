"""챗봇 확인용 데모 — 실제 LLM 없이 페르소나 조립·대화 파이프라인을 눈으로 본다.

  uv run python -m chatbot.demo
  uv run python -m chatbot.demo --age 30대 --gender male --hobbies 운동,여행 --style 활발한 --stage after

※ 봇의 '실제 답변'은 로컬 LLM 연결 후 확인 가능. 지금은 Mock 고정 응답으로 파이프라인만 확인.
"""

from __future__ import annotations

import argparse
import sys

from chatbot.conversation import Conversation
from chatbot.llm import MockLLM
from chatbot.persona import (
    build_system_prompt,
    build_system_prompt_from_persona,
    load_personas,
    sample_persona,
)
from chatbot.schemas import PersonaSpec

_LINE = "=" * 64


def main() -> None:
    # Windows 콘솔(cp949)에서 한글 깨짐 방지 — 출력 UTF-8 강제
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

    ap = argparse.ArgumentParser(description="챗봇 페르소나/대화 확인 데모")
    ap.add_argument("--age", default="20대")
    ap.add_argument("--gender", default="female", help="female / male")
    ap.add_argument("--hobbies", default="전시,카페", help="쉼표 구분")
    ap.add_argument("--style", default="다정하고 편안한")
    ap.add_argument("--personality", default="차분한")
    ap.add_argument("--stage", default="before", help="before / after")
    # 데이터셋(Nemotron-Personas-Korea) 랜덤 매칭 모드
    ap.add_argument("--dataset", action="store_true", help="실제 한국인 페르소나 랜덤 추출")
    ap.add_argument("--sex", default=None, help="데이터셋 필터: 남자 / 여자")
    ap.add_argument("--min-age", type=int, default=None)
    ap.add_argument("--max-age", type=int, default=None)
    args = ap.parse_args()

    if args.dataset:
        _dataset_demo(args)
        return

    spec = PersonaSpec(
        age_group=args.age,
        gender=args.gender,
        hobbies=[h.strip() for h in args.hobbies.split(",") if h.strip()],
        speech_style=args.style,
        personality=args.personality,
    )

    print(_LINE)
    print("① 선택한 페르소나 속성 (사용자가 고른 값)")
    print(_LINE)
    for k, v in spec.to_contract().items():
        print(f"  {k}: {v}")

    print("\n" + _LINE)
    print("② 조립된 시스템 프롬프트 (이 문장이 LLM에 주입됨)")
    print(_LINE)
    print(build_system_prompt(spec, stage=args.stage))

    print("\n" + _LINE)
    print("③ 대화 파이프라인 (Mock LLM - 실제 답변 아님, 흐름 확인용)")
    print(_LINE)
    conv = Conversation(MockLLM("반가워요! 오늘 날씨 좋네요"), spec, stage=args.stage)
    for user_msg in ["안녕하세요", "취미가 뭐예요?"]:
        bot = conv.send(user_msg)
        print(f"  🙋 나 : {user_msg}")
        print(f"  🤖 봇 : {bot.text}")
    print(f"\n  → 이력 {len(conv.history)}개 메시지 저장됨 (유저/봇 번갈아).")

    print("\n" + _LINE)
    print("※ 봇의 '진짜 답변'은 로컬 LLM 연결 후. 지금은 Mock 고정 응답이라 내용은 무의미.")
    print("  지금 확인 포인트 = ① 속성이 ② 프롬프트에 정확히 반영되는가.")
    print(_LINE)


def _dataset_demo(args: argparse.Namespace) -> None:
    """Nemotron-Personas-Korea 에서 실제 한국인 페르소나를 랜덤 추출해 보여준다."""
    try:
        personas = load_personas()
    except FileNotFoundError as e:
        print(e)
        return

    print(_LINE)
    print(f"① 데이터셋에서 랜덤 추출 (총 {len(personas)}명 풀, 필터: sex={args.sex} "
          f"age={args.min_age}~{args.max_age})")
    print(_LINE)
    p = sample_persona(personas, sex=args.sex, min_age=args.min_age, max_age=args.max_age)
    print(f"  이번에 뽑힌 상대: {p.sex} {p.age}세 · {p.occupation}")
    print(f"  소개: {p.persona}")
    print(f"  취미: {p.hobbies_and_interests}")

    print("\n" + _LINE)
    print("② 그 인물로 조립된 시스템 프롬프트")
    print(_LINE)
    sp = build_system_prompt_from_persona(p, stage=args.stage)
    print(sp)

    print("\n" + _LINE)
    print("③ 대화 파이프라인 (Mock LLM - 흐름 확인용)")
    print(_LINE)
    conv = Conversation(MockLLM("아 반가워요! 어떻게 지내세요?"), system_prompt=sp)
    for user_msg in ["안녕하세요", "취미가 뭐예요?"]:
        bot = conv.send(user_msg)
        print(f"  🙋 나 : {user_msg}")
        print(f"  🤖 봇 : {bot.text}")

    print("\n" + _LINE)
    print("※ 다시 실행하면 다른 한국인 페르소나가 랜덤으로 뽑힘 (소개팅 랜덤 매칭).")
    print("  봇의 진짜 답변은 로컬 LLM 연결 후.")
    print(_LINE)


if __name__ == "__main__":
    main()
