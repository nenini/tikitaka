"""비호감·호감 멘트 사전 (S15P11A307-491).

출처: `AI_문서/리포트_설계.md` §5 — 결혼정보회사 가연 설문(미혼남녀 225명)·지식인·명세 §12.1.
용도: 이슈 카드의 유형 판정 + 대체 문장 제안, 긍정 카드의 근거.

⚠️ LLM에게 **자유롭게 판단하라고 하지 않는다.** 이 목록을 프롬프트에 주고
"여기 있는 유형에만 해당하면 표시하라"고 제한한다. 그래야 근거 없는 지적이 안 나온다.

⚠️ 한국어·이성 소개팅 일반론 기반이다. 명세 §21은 관리자 화면에서 수정 가능해야
한다고 정했으므로, 나중에 DB로 옮길 수 있게 순수 데이터로만 둔다(로직 없음).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AvoidPattern:
    """피해야 할 발언 유형. `replacement`가 None이면 대체 문장 없이 '금지'만 안내한다."""

    code: str
    label: str
    examples: tuple[str, ...]
    reason: str
    replacement: str | None
    severity: str  # "high" | "medium"


@dataclass(frozen=True)
class FavorPattern:
    """호감 행동. 긍정 카드의 근거로 쓴다."""

    code: str
    label: str
    evidence: str
    sample: str


AVOID_PATTERNS: tuple[AvoidPattern, ...] = (
    AvoidPattern(
        "EX_PARTNER", "전 애인·과거 연애",
        ("전에 만나던 사람은", "왜 헤어졌어요", "연애 안 한 지 얼마나 됐어요"),
        "현재 분위기를 깨고 비교당하는 느낌을 준다 (설문 1위 37.8%)",
        "요즘 뭐에 제일 빠져 있어요?", "high",
    ),
    AvoidPattern(
        "PROBING_STATUS", "조건·개인사 캐기",
        ("부모님 직업은", "집은 자가예요", "연봉이", "몇 평 살아요"),
        "면접·조건 검증처럼 느껴져 경계심을 부른다 (집안·가족 16.9%)",
        "어떤 일 하실 때 제일 재밌으세요?", "high",
    ),
    AvoidPattern(
        "INTERVIEW_STYLE", "면접식 반복 단답 질문",
        ("취미가 뭐예요", "특기는요"),
        "대화가 아니라 면접처럼 흘러 금방 지친다",
        "최근에 재밌게 한 거 있어요?", "medium",
    ),
    AvoidPattern(
        "POLITICS_RELIGION", "정치·종교",
        ("어느 당 지지해요", "종교 있으세요"),
        "갈등 소지가 큰 민감 주제 (설문 2위 25.3%)",
        "요즘 관심 가는 거 있어요?", "high",
    ),
    AvoidPattern(
        "APPEARANCE", "외모 지적·평가",
        ("사진이랑 좀 다르네요", "살 좀 빼면"),
        "무례하게 느껴지고 상처를 준다",
        "목소리가 편안하시네요", "high",
    ),
    AvoidPattern(
        "AGE_GENDER_BIAS", "나이·조건 비하",
        ("그 나이에 아직", "여자가 그러면", "남자가 그러면"),
        "비하·차별 발언",
        None, "high",
    ),
    AvoidPattern(
        "MARRIAGE_PRESSURE", "결혼·출산 압박",
        ("결혼은 언제쯤", "애는 몇 낳고 싶어요"),
        "부담과 압박을 준다",
        "앞으로 어떤 삶을 살고 싶은지 궁금해요", "medium",
    ),
    AvoidPattern(
        "SEXUAL", "성적 질문·농담",
        (),
        "불쾌감과 위협을 준다",
        None, "high",
    ),
    AvoidPattern(
        "OVERSHARE", "자기 자랑·자기 얘기 오버쉐어",
        ("제가 예전에",),
        "상대가 소외되고 대화 균형이 무너진다",
        "한 마디 하고 되묻기 — \"그쪽은요?\"", "medium",
    ),
    AvoidPattern(
        "DISMISSIVE", "비꼼·무시·공격적 단정",
        ("그건 아니죠", "에이 그건 좀"),
        "무시당하는 느낌을 준다",
        "아 그렇게 볼 수도 있겠네요", "medium",
    ),
    AvoidPattern(
        "PRIVACY_EARLY", "개인정보 요구(초반)",
        ("어디 정확히 살아요", "인스타 뭐예요"),
        "초반에는 부담과 경계심을 준다",
        "(후반·상호 동의 후에 물어보기)", "medium",
    ),
    AvoidPattern(
        "HATE", "혐오·차별",
        (),
        "즉시 비호감이며 제재 대상",
        None, "high",
    ),
)

FAVOR_PATTERNS: tuple[FavorPattern, ...] = (
    FavorPattern("COMPLIMENT", "칭찬(스타일·목소리·인상)", "가연 성공 대화 1위 35.8%",
                 "인상이 편안하다고 자연스럽게 말한 게 좋았어요"),
    FavorPattern("HOBBY", "취미 이야기", "26.8%",
                 "취미로 공통점을 찾아간 흐름이 좋았어요"),
    FavorPattern("TASTE", "음식·영화 취향", "18.1%",
                 "취향 이야기로 편하게 대화를 이어갔어요"),
    FavorPattern("TRAVEL", "여행 경험담(경험형 질문)", "11.4%",
                 "'기억에 남는 여행지' 같은 경험 질문이 대화를 열었어요"),
    FavorPattern("ASK_BACK", "되묻기(공 넘기기)·경청", "커뮤니티 공통",
                 "상대 말 끝나고 받아친 리듬이 편안했어요"),
)

_BY_CODE: dict[str, AvoidPattern] = {p.code: p for p in AVOID_PATTERNS}


def avoid_pattern(code: str) -> AvoidPattern | None:
    """LLM이 돌려준 코드가 사전에 있는지 확인한다. 없으면 그 지적은 버린다."""
    return _BY_CODE.get(code)


def avoid_catalog_for_prompt() -> str:
    """프롬프트에 넣을 사전 요약. 코드·유형·예시·대체문장만 담는다."""
    lines: list[str] = []
    for pattern in AVOID_PATTERNS:
        examples = ", ".join(f'"{e}"' for e in pattern.examples) or "(예시 없음)"
        replacement = pattern.replacement or "(대체 문장 없음 — 하지 말아야 할 말)"
        lines.append(
            f"- {pattern.code} | {pattern.label} | 예: {examples} | 대체: {replacement}"
        )
    return "\n".join(lines)


def favor_catalog_for_prompt() -> str:
    lines: list[str] = []
    for pattern in FAVOR_PATTERNS:
        lines.append(f"- {pattern.code} | {pattern.label} | 예: {pattern.sample}")
    return "\n".join(lines)
