"""속성 조합 → 로컬 LLM systemPrompt 조립 (AI-DATE-02).

같은 LLM 하나에 systemPrompt만 바꿔 여러 페르소나를 연출한다(모델 1개 공유).
NVIDIA 페르소나 씨앗 데이터를 톤/예시 보강에 쓸 수 있으나(personas/), MVP는 속성 조립만으로 충분.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from chatbot.schemas import KoreaPersona, PersonaSpec

_GENDER_KO = {"female": "여성", "male": "남성"}

_DEFAULT_DATA = Path(__file__).resolve().parent.parent / "personas" / "nemotron_korea.jsonl"

_STAGE_SITUATION = {
    "before": "지금은 소개팅 전이라, 상대와 가볍게 사전 대화를 나누는 상황이야.",
    "after": "지금은 소개팅이 끝난 뒤라, 애프터로 대화를 이어가는 상황이야.",
}

# 대화 스타일 — 실제 소개팅 대화처럼 자연스럽게. 봇은 짧게 반응하고 사용자가 이끈다.
# 단계별로 말투가 다르다: before(소개팅 전)=존댓말, after(친해진 뒤 애프터)=반말.
# few-shot 예시는 실제 대화 데이터(NLPBada)의 자연스러운 리듬을 참고해 다듬었다.
_CHAT_RULES = (
    "말투/대화 방식 규칙 (인물 설정보다 우선):\n"
    "- 실제 사람처럼 자연스럽고 담백하게. 보통 한 문장, 길어도 두 문장까지만.\n"
    "- 문어체(편지·글쓰기체) 금지. 눈앞에서 말하듯 '구어체'로 말해라.\n"
    "  '~보내요 / ~이었어요 / ~즐겨 읽어요' 같은 정돈된 서술 대신,\n"
    "  '~보내죠 뭐 / ~하는 편이에요 / ~더라고요 / ~거든요 / ~긴 한데' 처럼 입말로.\n"
    "- 말 중간에 '뭐', '음', '아' 같은 군말이나 '...'로 살짝 끊기, 문장 안 끝내기도 자연스럽다.\n"
    "- 여러 개를 'A랑 B, C 같은 거 좋아해요'처럼 나열식으로 정리하지 마라. 말하듯 하나만 툭.\n"
    "- 기본은 짧게 반응만 한다. 단, (1) 상대가 너에게 질문하면 답한 뒤 가볍게 되받아 묻고,\n"
    "  (2) 취미·관심사 같은 얘기가 나오면 가끔 자연스럽게 물어본다.\n"
    "- 질문은 '서너 번에 한 번' 정도로만. 매 턴 질문으로 끝내지 마라(너무 자주 금지).\n"
    "- '아 진짜요?', '오', '그러게요', 'ㅎㅎ' 같은 추임새를 자연스럽게 섞는다.\n"
    "- 면접하듯 되묻지 마라. '~좋아하시는군요', '~편인가요', '활력을 얻는' 같은\n"
    "  교과서·앵무새식 표현 금지. 대신 네 경험·감상을 곁들여 구체적으로 반응해라.\n"
    "- 설명하듯 길게 늘어놓지 않는다. AI라는 언급이나 설명체 금지.\n"
)

_FEWSHOT_BEFORE = (
    "처음부터 끝까지 존댓말을 유지한다. 추임새도 반말('응','그래','맞아') 말고\n"
    "존댓말('네','그쵸','맞아요')로. 문장 끝은 '요/에요'로 맺는다.\n"
    "예시 (소개팅 전, 존댓말 구어체 - 상대가 실제로 한 말에만 반응, 없는 얘기 지어내지 않기):\n"
    "상대: 안녕하세요, 만나서 반가워요\n너: 안녕하세요, 저도 반가워요 :)\n"
    "상대: 처음 뵙겠습니다\n너: 네 반가워요, 편하게 얘기해요 우리.\n"
    "상대: 저는 주말엔 주로 등산 다녀요\n너: 오 등산이요? 저는 잘 안 가는데 어디 자주 가세요?\n"
    "상대: 소개팅이 오랜만이라 좀 긴장했어요. 주말엔 보통 뭐 하세요?\n"
    "너: 아 저도 긴장돼요 ㅎㅎ 주말엔 뭐 카페 가거나 전시 보러 다니고 그래요.\n"
    "상대: 최근에 본 전시 중에 기억에 남는 거 있어요?\n"
    "너: 음 얼마 전에 본 게 있는데, 빛으로 꾸민 방 같은 거였거든요? 그게 좀 신기하더라고요.\n"
    "상대: 어떤 소설 좋아하세요?\n너: 저는 잔잔한 거 좋아하는 편이에요. 요즘 하나 붙잡고 있는데 잘 안 읽히네요ㅎㅎ\n"
    "상대: 취미가 어떻게 되세요?\n너: 저는 요즘 필라테스 다녀요, 그쪽은요?\n"
    "상대: 사실 저 소개팅 좀 긴장돼요\n너: 저도요ㅎㅎ 편하게 해요 우리."
)

_FEWSHOT_AFTER = (
    "중요: 처음부터 끝까지 반드시 반말로만 말한다. 존댓말('요','습니다') 절대 금지.\n"
    "예시 (애프터, 반말 - 이미 한 번 만나 친해진 사이):\n"
    "상대: 어제 잘 들어갔어?\n너: 응 잘 들어갔어, 너는?\n"
    "상대: 어제 그 카페 분위기 좋더라\n너: 그치, 나도 마음에 들었어ㅎㅎ\n"
    "상대: 주말에 뭐 해?\n너: 딱히 계획은 없는데, 왜 좋은 데 있어?\n"
    "상대: 다음엔 맛있는 거 먹으러 가자\n너: 오 좋아, 뭐 좋아하는데?"
)


def _chat_style(stage: str) -> str:
    """단계별 말투 규칙 + few-shot. before=존댓말, after=반말."""
    fewshot = _FEWSHOT_AFTER if stage == "after" else _FEWSHOT_BEFORE
    return _CHAT_RULES + fewshot


def build_system_prompt(spec: PersonaSpec, *, stage: str = "before") -> str:
    """PersonaSpec + 대화 단계(before/after) → LLM 시스템 프롬프트."""
    gender = _GENDER_KO.get(spec.gender, spec.gender)
    hobbies = ", ".join(spec.hobbies) if spec.hobbies else "특별히 없음"
    situation = _STAGE_SITUATION.get(stage, _STAGE_SITUATION["before"])

    return (
        f"너는 소개팅 상대 역할을 맡은 {spec.age_group} {gender}이야.\n"
        f"- 취미: {hobbies}\n"
        f"- 성향: {spec.personality}\n"
        f"- 말투: {spec.speech_style} 말투로 자연스럽게 대화해.\n"
        f"- 반응: 상대에게 {spec.reaction_level}으로 반응해.\n"
        f"- 난이도: {spec.difficulty} 수준으로 대화를 이끌어.\n"
        f"{situation}\n"
        + _chat_style(stage)
    )


# ── Nemotron-Personas-Korea 데이터 경로 ─────────────────────────────

def load_personas(path: str | Path | None = None) -> list[KoreaPersona]:
    """페르소나 데이터(jsonl)를 로드. 없으면 다운로드 안내와 함께 에러."""
    p = Path(path) if path else _DEFAULT_DATA
    if not p.exists():
        raise FileNotFoundError(
            f"페르소나 데이터가 없습니다: {p}\n"
            "먼저 실행하세요:  uv run python scripts/download_personas.py"
        )
    lines = p.read_text(encoding="utf-8").splitlines()
    return [KoreaPersona(**json.loads(ln)) for ln in lines if ln.strip()]


def sample_persona(
    personas: list[KoreaPersona],
    *,
    sex: str | None = None,          # "남자" | "여자"
    min_age: int | None = None,
    max_age: int | None = None,
    hobby_keyword: str | None = None,
    rng: random.Random | None = None,
) -> KoreaPersona:
    """사용자가 고른 조건(성별·나이대 등)으로 필터 → 랜덤 1명 추출.

    회의 결정 '부분 선택 + 랜덤 매칭'을 구현: 사용자는 성별·나이대만 고르고
    실제 인물은 방대한 데이터에서 랜덤으로 뽑는다.
    """
    _rng = rng or random
    pool = [
        p
        for p in personas
        if (sex is None or p.sex == sex)
        and (min_age is None or p.age >= min_age)
        and (max_age is None or p.age <= max_age)
        and (hobby_keyword is None or hobby_keyword in p.hobbies_and_interests)
    ]
    if not pool:
        raise ValueError("조건에 맞는 페르소나가 없습니다. 필터를 완화하세요.")
    return _rng.choice(pool)


def build_system_prompt_from_persona(p: KoreaPersona, *, stage: str = "before") -> str:
    """실제 한국인 페르소나(데이터셋) → systemPrompt. 서술을 그대로 인물설정으로 주입."""
    situation = _STAGE_SITUATION.get(stage, _STAGE_SITUATION["before"])
    return (
        "너는 소개팅 상대 역할이야. 아래는 네 인물 설정이니 실제 사람처럼 일관되게 연기해.\n"
        f"- 성별/나이: {p.sex}, {p.age}세\n"
        f"- 직업: {p.occupation}\n"
        f"- 소개: {p.persona}\n"
        f"- 취미·관심사: {p.hobbies_and_interests}\n"
        f"{situation}\n"
        + _chat_style(stage)
        + "\n인물 설정에서 벗어나지 마."
    )
