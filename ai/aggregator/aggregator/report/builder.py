"""리포트 문장 생성 (S15P11A307-490·491) — EXAONE에게 **설명만** 시킨다.

역할 분리(설계 E):
  scoring.py 가 계산한 수치가 **유일한 정답**이다. 여기서는 그 수치를 프롬프트에
  사실로 박아 넣고, LLM에게는 "이 수치를 설명하는 문장"만 만들게 한다.
  LLM이 스스로 센 숫자는 쓰지 않는다 — 아래 세 겹으로 막는다.

  1) 프롬프트에서 금지 (수치 재계산·새 숫자 금지)
  2) 출력 스키마에 숫자 필드를 아예 두지 않음 (문장만 받는다)
  3) 이슈 유형은 사전 코드로 제한 — 모르는 코드는 파싱 단계에서 버린다

인코딩 주의: 한국어 프롬프트는 반드시 UTF-8로 인코딩해 보낸다.
Windows 셸에서 `curl -d`로 테스트하면 한글이 깨져 모델이 "읽을 수 없다"고 답한다
(2026-08-03 실측). 디버깅은 Python으로 할 것.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from aggregator.report.dictionary import (
    avoid_catalog_for_prompt,
    avoid_pattern,
    favor_catalog_for_prompt,
)
from aggregator.report.input import ReportInput
from aggregator.report.scoring import (
    AXIS_BALANCE,
    AxisScore,
    ReportScores,
    SpeakerMetrics,
)
from aggregator.settings import IntegrationSettings

MAX_CARDS = 6
"""근거 카드 총량 상한(레이아웃 §15.4). 개선점 과다 노출은 연습 동기를 꺾는다."""

TRANSCRIPT_LIMIT = 600
"""프롬프트에 넣는 발화 수 상한. 넘으면 가운데를 중략한다.

이전 값 120은 너무 작았다. 24분 세션이 403발화였고 조건 캐기·결혼 압박 발화가 전부
중략 구간에 묻혀, LLM이 근거를 못 본 채 이슈를 지적하고 엉뚱한 발화를 인용했다.
600발화면 프롬프트가 약 16,000자로 GPU 서버 컨텍스트(32768)에 넉넉히 들어간다.
"""


class ReportLlmError(RuntimeError):
    """LLM 호출·파싱 실패. 호출자는 폴백 리포트로 넘어간다."""


class TextGenerator(Protocol):
    """LLM 경계. 테스트는 가짜 구현을 넣어 네트워크 없이 검증한다."""

    def generate(self, prompt: str) -> str: ...


@dataclass(frozen=True)
class EvidenceCard:
    kind: str          # issue | behavior | positive | filler
    title: str
    context: str       # 맥락 요약 (원문 나열 금지)
    quote: str | None  # 근거 발언 — include_quotes=False면 항상 None
    suggestion: str | None
    pattern_code: str | None


@dataclass(frozen=True)
class ReportNarrative:
    summary: str
    strengths: tuple[str, ...]
    improvements: tuple[str, ...]
    missions: tuple[str, ...]
    cards: tuple[EvidenceCard, ...]
    generated_by_llm: bool
    """False면 LLM 실패로 규칙 기반 폴백을 쓴 것이다."""


@dataclass
class OllamaGenerator:
    """Ollama `/api/generate`. JSON 강제(`format=json`)로 파싱 실패를 줄인다."""

    base_url: str
    model: str
    timeout_seconds: float = 120.0
    client: httpx.Client | None = None
    options: dict[str, object] = field(
        default_factory=lambda: {"temperature": 0.4, "num_predict": 1400}
    )

    def generate(self, prompt: str) -> str:
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": self.options,
        }
        url = f"{self.base_url.rstrip('/')}/api/generate"
        try:
            if self.client is not None:
                response = self.client.post(url, json=payload)
            else:
                with httpx.Client(timeout=self.timeout_seconds) as client:
                    response = client.post(url, json=payload)
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise ReportLlmError(f"리포트 LLM 호출 실패: {error}") from error
        text = body.get("response")
        if not isinstance(text, str) or not text.strip():
            raise ReportLlmError("리포트 LLM이 빈 응답을 반환했습니다")
        return text


def generator_from_settings(settings: IntegrationSettings) -> OllamaGenerator:
    if not settings.report_llm_configured:
        raise ReportLlmError("REPORT_LLM_BASE_URL 환경변수가 필요합니다")
    return OllamaGenerator(
        base_url=settings.report_llm_base_url,
        model=settings.report_llm_model,
        timeout_seconds=settings.report_llm_timeout_seconds,
    )


# ── 프롬프트 ─────────────────────────────────────────────────────────
_SYSTEM_RULES = """너는 소개팅 대화 연습 서비스의 리포트 작성자다.

절대 규칙:
1. 아래 '측정 결과'의 수치는 이미 계산이 끝난 사실이다. 절대 다시 세거나 바꾸지 마라.
2. 측정 결과에 없는 숫자를 새로 만들지 마라. 문장에 숫자를 넣지 마라.
3. 이슈는 '피해야 할 유형' 목록에 있는 것만 지적하라. 목록에 없으면 지적하지 마라.
4. 감정이나 의도를 단정하지 마라. "~해 보여요", "~한 편이에요"처럼 여지를 남겨라.
5. 외모를 평가하지 마라.
6. 연습을 돕는 코치의 말투로 쓴다. 인격을 비난하지 말고 행동만 말한다.
7. 잘한 점은 반드시 1개 이상 쓴다. 지적할 게 없어도 긍정은 남긴다.

점수를 있는 그대로 말하는 규칙 (중요):
8. **2.5점 이하인 축은 요약과 개선점에서 반드시 짚어라.** 낮은 점수를 좋게 포장하지 마라.
   "침묵이 많았어요"를 "편안한 분위기였어요"로 바꿔 쓰면 안 된다.
   단 **횟수를 적지 마라** — "침묵 시간이 길었어요"까지만 쓰고 "(12회)"는 붙이지 않는다.
   숫자는 화면에서 따로 보여준다.
9. 요약은 **가장 낮은 축을 먼저** 말하고 그 다음에 잘된 점을 붙인다.
   점수가 전반적으로 낮으면 요약도 그렇게 읽혀야 한다.
10. 측정 부족인 축은 언급하지 마라. 점수가 없는 것을 좋다/나쁘다고 쓰면 거짓이 된다.
11. 완곡어법으로 사실을 뒤집지 마라. 개선점은 "~할 수 있었어요"보다
    "~했어요"로 사실을 먼저 쓰고 방법을 덧붙인다.
"""

# 인용은 **글자를 옮기게 하지 않는다**. EXAONE 7.8B는 대화 기록을 보고도 매번 말을
# 다시 지어냈다(3회 연속 "혹시 부모님은 어떤 일 하세요" → "부모님 직업은 어떻게 되세요?").
# 그래서 번호만 고르게 하고 원문은 코드가 붙인다.
_QUOTE_ALLOWED = """8. 이슈 카드에 근거 발언을 달려면 quoteRef에 '대화 기록'의 **번호**를 써라.
   발언을 직접 옮겨 적지 마라 — 번호만 쓰면 원문은 시스템이 붙인다.
   번호가 붙은 줄(내 발언)만 고를 수 있다. 마땅한 게 없으면 quoteRef는 null로 둔다."""
_QUOTE_FORBIDDEN = """8. 근거 발언을 인용하지 마라. quoteRef는 항상 null로 두고 맥락 요약만 써라."""

_OUTPUT_SPEC = """
## 출력 형식

아래 예시와 **똑같은 구조**의 JSON만 출력하라. 설명이나 다른 말은 쓰지 마라.

{
  "summary": "편안한 분위기로 대화가 이어졌어요.",
  "strengths": ["되묻기가 자연스러웠어요", "취미로 공통점을 찾았어요", "말하는 리듬이 편안했어요"],
  "improvements": ["한 주제에 오래 머물렀어요", "질문이 조금 적었어요"],
  "missions": ["상대에게 한 번 더 되물어 보기"],
  "cards": [
    {
      "kind": "issue",
      "title": "개인사 질문",
      "context": "직장 이야기를 나누다 가족 관련 질문으로 옮겨갔어요.",
      "quoteRef": null,
      "suggestion": "어떤 일 하실 때 제일 재밌으세요?",
      "patternCode": "PROBING_STATUS"
    },
    {
      "kind": "positive",
      "title": "되묻기",
      "context": "상대 이야기를 받아 자연스럽게 되물었어요.",
      "quoteRef": null,
      "suggestion": null,
      "patternCode": null
    }
  ]
}

필드 규칙:
- "kind": 정확히 다음 넷 중 **하나의 단어**만 쓴다 → issue / behavior / positive / filler
  (여러 개를 나열하거나 "issue | behavior" 처럼 쓰면 그 카드는 버려진다)
- "patternCode": kind가 issue일 때 **반드시** 위 '피해야 할 유형' 목록의 코드를 쓴다.
  코드가 없으면 그 카드는 버려진다. issue가 아니면 null.
- "quoteRef": 위 '대화 기록'에서 그 지적의 **근거가 되는 줄의 번호**를 찾아서 써라.
  위 예시의 null을 그대로 베끼지 말고, 실제로 대화 기록을 읽고 해당 줄 번호를 찾아라.
  근거가 되는 줄을 못 찾겠으면 그때만 null. 문장이 아니라 숫자만 쓴다.
- "suggestion": 없으면 문자열 "null"이 아니라 JSON null 로 쓴다.
- 개수: strengths 3개, improvements 2개, missions 1~3개, cards 최대 6개.
- 대화에 '피해야 할 유형'에 해당하는 발언이 있으면 **반드시 issue 카드로 남겨라.**
"""


def build_prompt(
    report: ReportInput,
    scores: ReportScores,
    speaker_id: str,
    *,
    include_quotes: bool,
    transcript_limit: int = TRANSCRIPT_LIMIT,
) -> str:
    """수치를 사실로 박고 문장만 요청하는 프롬프트를 만든다."""
    metrics = next((m for m in scores.metrics if m.speaker_id == speaker_id), None)
    axes = scores.for_speaker(speaker_id)
    quote_rule = _QUOTE_ALLOWED if include_quotes else _QUOTE_FORBIDDEN
    return "\n".join(
        (
            _SYSTEM_RULES,
            quote_rule,
            "",
            "## 측정 결과 (이미 계산 완료 — 재계산 금지)",
            _format_metrics(metrics, scores.session_duration_ms),
            "",
            "## 6축 점수",
            _format_axes(axes),
            _format_goals(speaker_goals(report, speaker_id)),
            "",
            "## 피해야 할 유형 (이 목록에 있는 것만 지적)",
            avoid_catalog_for_prompt(),
            "",
            "## 호감을 준 행동 (긍정 근거로 활용)",
            favor_catalog_for_prompt(),
            "",
            "## 대화 기록",
            _format_transcript(report, speaker_id, transcript_limit),
            "",
            _OUTPUT_SPEC,
        )
    )


def _format_metrics(metrics: SpeakerMetrics | None, duration_ms: int) -> str:
    if metrics is None:
        return "- (측정 결과 없음)"
    minutes = duration_ms / 60_000
    ratio = "측정 불가" if metrics.speaking_ratio is None else f"{metrics.speaking_ratio:.0%}"
    lines = [
        f"- 세션 길이: {minutes:.0f}분",
        f"- 내 발화 비율: {ratio}",
        # 질문 수는 넣지 않는다 — STT가 짧은 발화에 문장부호를 안 붙여 집계가 틀린다
        # (scoring._score_question 참고). 틀린 숫자를 주면 LLM이 그걸로 문장을 만든다.
        "- 질문: 측정 부족 (질문 횟수·질문이 많다/적다는 언급하지 마라)",
        f"- 필러워드: {metrics.filler_count}회",
        f"- 15초 이상 침묵: {metrics.long_silence_count}회",
        f"- 말 끊기: {metrics.interruption_count}회 (맞장구는 제외한 수)",
        f"- 맞장구: {metrics.backchannel_count}회",
    ]
    if metrics.filler_breakdown:
        breakdown = ", ".join(
            f'"{token}" {count}회'
            for token, count in sorted(
                metrics.filler_breakdown.items(),
                key=lambda item: (-item[1], item[0]),
            )
        )
        lines.append(f"- 필러워드별: {breakdown}")
    if metrics.vision_measured:
        lines += [
            f"- 미소: {metrics.smile_episode_count}회",
            f"- 시선 이탈: {metrics.gaze_away_count}회",
            f"- 얼굴 이탈: {metrics.face_missing_count}회",
        ]
    else:
        lines.append("- 카메라 신호: 측정 부족 (표정·시선은 언급하지 마라)")
    return "\n".join(lines)


WEAK_AXIS_SCORE = 2.5
"""이 점수 이하인 축은 프롬프트에서 표시해 LLM이 반드시 짚게 한다.

표시 없이 규칙만 주면 낮은 점수를 "편안한 분위기"처럼 좋게 포장한다(실측 —
대화흐름 1.0점 세션의 요약이 "편안하고 자연스러운 대화가 이어졌으며…"로 나왔다).
"""


def _format_axes(axes: tuple[AxisScore, ...]) -> str:
    if not axes:
        return "- (점수 없음)"
    lines = []
    for axis in axes:
        mark = ""
        if axis.measured and axis.score is not None and axis.score <= WEAK_AXIS_SCORE:
            mark = "   ← 낮음. 요약과 개선점에서 반드시 언급하라"
        elif not axis.measured:
            mark = "   ← 측정 부족. 언급하지 마라"
        lines.append(f"- {axis.axis}: {axis.display} — {axis.note}{mark}")
    return "\n".join(lines)


def quotable_index(report: ReportInput, speaker_id: str) -> dict[int, str]:
    """대화 기록에 붙일 번호 → 본인 발화 원문.

    LLM에게 인용을 시키면 말을 다시 지어내므로(실측), 번호만 고르게 하고 원문은
    이 표에서 꺼낸다. 번호는 프롬프트에 찍히는 것과 같아야 하므로 여기서 한 번만 만든다.
    상대 발화에는 번호를 주지 않는다 — 리포트는 본인 코칭이다.
    """
    return {
        index: u.text
        for index, u in enumerate(report.all_utterances)
        if u.speaker_id == speaker_id
    }


def _format_transcript(report: ReportInput, speaker_id: str, limit: int) -> str:
    """발화를 시간순으로. 너무 길면 앞뒤를 남기고 가운데를 줄인다."""
    utterances = report.all_utterances
    if not utterances:
        return "(발화 없음)"
    numbered = list(enumerate(utterances))
    if len(numbered) > limit:
        head = numbered[: limit // 2]
        tail = numbered[-(limit // 2) :]
        skipped = len(numbered) - len(head) - len(tail)
        rendered = (
            [_line(i, u, speaker_id) for i, u in head]
            + [f"... (중략 {skipped}개 발화) ..."]
            + [_line(i, u, speaker_id) for i, u in tail]
        )
    else:
        rendered = [_line(i, u, speaker_id) for i, u in numbered]
    return "\n".join(rendered)


def _line(index: int, utterance: object, speaker_id: str) -> str:
    start_ms = getattr(utterance, "start_ms", 0)
    text = getattr(utterance, "text", "")
    mine = getattr(utterance, "speaker_id", "") == speaker_id
    stamp = f"[{start_ms // 60000:02d}:{start_ms // 1000 % 60:02d}]"
    # 번호는 내 발언에만 — 인용 대상이 본인 발화로 제한된다는 걸 프롬프트에서 드러낸다
    return f"{index:>3}. {stamp} 나: {text}" if mine else f"     {stamp} 상대: {text}"


# ── 인용 검증 ────────────────────────────────────────────────────────
# LLM은 프롬프트에 있는 대화 기록을 보고 "비슷한 말"을 지어낸다. 실측 사례:
#   전사  "혹시 부모님은 어떤 일 하세요"  → 인용 "부모님 직업은 어떻게 되세요?"  (재구성)
#   전사  (해당 없음)                     → 인용 "회사 선배가 계속 얘기해서 나왔어요."(상대 발화)
# 프롬프트 규칙만으로는 확률적으로 새므로, 사전 코드 검증과 같은 층에서 코드로 막는다.
# 카드는 살리고 못 믿을 인용만 떼어낸다 — 지적 내용 자체는 사전 코드로 이미 검증됐다.
_QUOTE_NOISE = re.compile(r"[\s.,!?~…\"'“”‘’]+")
_MIN_QUOTE_CHARS = 4
"""이보다 짧으면 "네"·"맞아요"처럼 아무 발화에나 걸려 검증이 무의미하다."""


def _normalize_quote(text: str) -> str:
    return _QUOTE_NOISE.sub("", text)


def verify_quote(quote: str, own_utterances: tuple[str, ...]) -> str | None:
    """인용이 **본인이 실제로 한 말**인지 확인한다. 아니면 None.

    번호 참조(quoteRef)가 정상 경로이고 이건 방어선이다 — LLM이 번호 대신 문장을
    보내는 경우가 남아 있다. 부분 인용은 허용한다(긴 발화에서 한 대목만 따오는 건
    정상). 상대 발화는 허용하지 않는다 — 상대 말을 본인 근거로 붙이면 사실이 틀린다.
    """
    needle = _normalize_quote(quote)
    if len(needle) < _MIN_QUOTE_CHARS:
        return None
    for text in own_utterances:
        if needle in _normalize_quote(text):
            return quote
    return None


def _resolve_quote(
    entry: dict[str, object],
    quotable: dict[int, str],
    own_utterances: tuple[str, ...],
) -> str | None:
    """quoteRef(번호) 우선, 없으면 quote(문장)를 검증해서 받는다."""
    ref = entry.get("quoteRef")
    if isinstance(ref, bool):  # bool은 int의 하위형이라 먼저 걸러낸다
        ref = None
    if isinstance(ref, (int, str)):
        try:
            return quotable.get(int(ref))
        except (TypeError, ValueError):
            pass
    text = _optional_str(entry.get("quote"))
    return None if text is None else verify_quote(text, own_utterances)


# ── 응답 파싱 ────────────────────────────────────────────────────────
_NULLISH = {"", "null", "none", "n/a", "없음"}


def _optional_str(value: object) -> str | None:
    """LLM이 JSON null 대신 문자열 "null"을 쓰는 경우가 잦아 함께 걸러낸다(실측)."""
    if value is None:
        return None
    text = str(value).strip()
    return None if text.lower() in _NULLISH else text


def _as_str_tuple(value: object, limit: int) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    items = [str(item).strip() for item in value if str(item).strip()]
    return tuple(items[:limit])


# ── 측정 부족 축 언급 차단 ───────────────────────────────────────────
# 프롬프트에 "측정 부족인 축은 언급하지 마라"를 넣어도 샌다(실측 — 질문 축이 측정 부족인데
# "질문의 다양성이 조금 부족했어요"가 나왔다). 측정하지 않은 걸 좋다/나쁘다고 쓰면 거짓이라
# 코드로 걸러낸다. 인용 검증과 같은 층이다.
_AXIS_KEYWORDS = {
    "질문균형": ("질문", "되묻", "물어"),
    "리액션": ("리액션", "미소", "맞장구", "호응", "반응"),
    "비언어표현": ("시선", "표정", "카메라", "눈", "아이컨택"),
    "대화균형": ("발화 비율", "발화량", "말하는 양"),
    "경청": ("경청", "말 끊", "말끊"),
    "대화흐름": ("침묵", "정적"),
}
"""축별로 그 축을 가리키는 표현. 측정 부족일 때 이 단어가 든 문장을 버린다."""


def _unmeasured_keywords(axes: tuple[AxisScore, ...]) -> tuple[str, ...]:
    words: list[str] = []
    for axis in axes:
        if not axis.measured:
            words.extend(_AXIS_KEYWORDS.get(axis.axis, ()))
    return tuple(words)


def _drop_unfounded(items: tuple[str, ...], forbidden: tuple[str, ...]) -> tuple[str, ...]:
    if not forbidden:
        return items
    return tuple(item for item in items if not any(word in item for word in forbidden))


# ── 설문 목표 개인화 ──────────────────────────────────────────────────
# 점수는 건드리지 않는다. 어느 축을 먼저 보여주고 어떻게 표현할지만 바꾼다.
# 축 점수는 세션 간·사람 간 비교에 쓰이므로(BE 성장추이) 기준이 사람마다
# 달라지면 안 된다.

_GOAL_AXIS = {
    "TALK_TOO_MUCH": AXIS_BALANCE,
    "TALK_TOO_LITTLE": AXIS_BALANCE,
}
"""설문 코드(`practice_goal_catalog.code`) → 대응 축. **측정 가능한 것만** 넣는다.

VOICE_TOO_LOUD·VOICE_TOO_QUIET은 뺐다 — 음량 지표가 파이프라인에 없다.
넣으면 LLM이 재지도 않은 목소리 크기를 지어낸다. OTHER는 자유 텍스트라 축이 없다.
"""

_GOAL_LABEL = {
    "TALK_TOO_MUCH": "말이 너무 많다고 느낀다",
    "TALK_TOO_LITTLE": "말이 너무 적다고 느낀다",
}

_GOAL_MISSION = {
    "TALK_TOO_MUCH": "상대가 말을 마친 뒤 속으로 셋을 세고 입을 여세요.",
    "TALK_TOO_LITTLE": "상대 이야기에 내 경험을 한 문장씩 덧붙여 보세요.",
}


_CONFLICTING = (("TALK_TOO_MUCH", "TALK_TOO_LITTLE"),)


def speaker_goals(report: ReportInput, speaker_id: str) -> tuple[str, ...]:
    speaker = report.speaker(speaker_id)
    return speaker.practice_goals if speaker else ()


def resolve_goals(goals: tuple[str, ...]) -> tuple[str, ...]:
    """서로 어긋나는 선택은 양쪽 다 버린다.

    설문이 다중선택이라 '말이 너무 많다'와 '너무 적다'를 함께 고를 수 있다. 그대로
    두면 "말을 줄이세요"와 "더 말하세요"가 한 리포트에 같이 실린다(실측). 어느 쪽이
    진심인지 알 방법이 없으므로 개인화를 포기하고 일반 리포트로 돌린다.
    """
    picked = tuple(dict.fromkeys(goals))
    for left, right in _CONFLICTING:
        if left in picked and right in picked:
            picked = tuple(code for code in picked if code not in (left, right))
    return picked


def goal_axes(goals: tuple[str, ...]) -> tuple[str, ...]:
    """설문 코드 중 측정 가능한 축으로 이어지는 것만 축 이름으로 바꾼다."""
    mapped = (_GOAL_AXIS.get(code) for code in resolve_goals(goals))
    return tuple(dict.fromkeys(axis for axis in mapped if axis is not None))


def _goal_keywords(axes: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(word for axis in axes for word in _AXIS_KEYWORDS.get(axis, ()))


def _prioritize(items: tuple[str, ...], axes: tuple[str, ...]) -> tuple[str, ...]:
    """목표 축을 가리키는 문장을 앞으로 당긴다. 순서만 바꾸고 내용은 그대로 둔다."""
    words = _goal_keywords(axes)
    if not words:
        return items
    hit = tuple(item for item in items if any(word in item for word in words))
    rest = tuple(item for item in items if item not in hit)
    return hit + rest


def _drop_goal_strengths(items: tuple[str, ...], axes: tuple[str, ...]) -> tuple[str, ...]:
    """본인이 고민이라고 한 축은 점수가 높아도 강점 목록에 올리지 않는다.

    고치고 싶다고 답한 걸 "잘하고 있어요"로 마무리하면 리포트를 안 믿는다.
    대신 그 사실은 요약 문장에서 대조로 다룬다(프롬프트 지시).
    강점이 하나도 없어지는 건 막는다 — 그건 더 나쁘다.
    """
    words = _goal_keywords(axes)
    if not words:
        return items
    kept = tuple(item for item in items if not any(word in item for word in words))
    return kept or items


def _goal_missions(missions: tuple[str, ...], goals: tuple[str, ...]) -> tuple[str, ...]:
    """목표에 맞는 사전 미션을 앞에 세운다.

    LLM이 낸 미션도 남기지만 첫 자리는 사전이 가져간다 — 이슈 카드의 순화 문구와
    같은 이유다. LLM은 같은 목표에 매번 다른 문장을 내서 달성 판정이 안 된다.
    """
    fixed = tuple(_GOAL_MISSION[code] for code in goals if code in _GOAL_MISSION)
    if not fixed:
        return missions
    return tuple(dict.fromkeys(fixed + missions))[:3]


def _apply_goals(narrative: ReportNarrative, goals: tuple[str, ...]) -> ReportNarrative:
    picked = resolve_goals(goals)
    axes = goal_axes(picked)
    if not axes:
        return narrative
    return ReportNarrative(
        summary=narrative.summary,
        strengths=_drop_goal_strengths(narrative.strengths, axes),
        improvements=_prioritize(narrative.improvements, axes),
        missions=_goal_missions(narrative.missions, picked),
        cards=narrative.cards,
        generated_by_llm=narrative.generated_by_llm,
    )


def _format_goals(goals: tuple[str, ...]) -> str:
    """프롬프트용. 측정 불가한 목표는 아예 빼서 LLM이 언급하지 못하게 한다."""
    known = tuple(
        _GOAL_LABEL[code] for code in resolve_goals(goals) if code in _GOAL_LABEL
    )
    if not known:
        return ""
    return "\n".join(
        (
            "",
            "## 사용자가 미리 고민이라고 답한 것",
            *(f"- {label}" for label in known),
            "지시: 요약 첫 문장에서 이 고민을 **측정값과 견줘** 다뤄라.",
            "고민과 측정이 어긋나면(많다고 했는데 비율이 낮다 등) 그 사실을 그대로 알려라.",
            "개선점에서도 이 축을 가장 먼저 다뤄라.",
        )
    )


def parse_narrative(
    raw: str,
    *,
    include_quotes: bool,
    own_utterances: tuple[str, ...] = (),
    quotable: dict[int, str] | None = None,
    axes: tuple[AxisScore, ...] = (),
    goals: tuple[str, ...] = (),
) -> ReportNarrative:
    """LLM 응답 → ReportNarrative. 규칙 위반 항목은 조용히 버린다.

    인용은 quotable(번호 → 원문)에서 꺼내는 게 정상 경로다. LLM이 번호 대신 문장을
    보내면 own_utterances로 검증한다. 둘 다 없으면 인용을 못 믿으므로 include_quotes와
    무관하게 전부 떼어낸다 — 검증 없는 인용은 내보내지 않는다.

    axes를 주면 **측정 부족인 축을 언급한 문장을 버린다.** 안 주면 검사하지 않는다.
    goals(설문 코드)를 주면 그 축을 개선점 앞으로 당기고 강점에서 뺀다 — 프롬프트로만
    시키면 확률적으로 새므로 여기서 코드로 강제한다.
    """
    lookup = quotable or {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ReportLlmError(f"리포트 LLM 응답이 JSON이 아닙니다: {error}") from error
    if not isinstance(data, dict):
        raise ReportLlmError("리포트 LLM 응답이 객체가 아닙니다")

    cards: list[EvidenceCard] = []
    for entry in data.get("cards", []) if isinstance(data.get("cards"), list) else []:
        if not isinstance(entry, dict):
            continue
        kind = str(entry.get("kind", "")).strip().lower()
        if kind not in {"issue", "behavior", "positive", "filler"}:
            # "issue | behavior"처럼 형식 설명을 그대로 베낀 경우도 여기서 걸린다
            continue
        code = _optional_str(entry.get("patternCode"))
        suggestion = _optional_str(entry.get("suggestion"))
        if kind == "issue":
            # 사전에 없는 코드로 지적하면 근거가 없다 → 버린다
            pattern = avoid_pattern(code) if code is not None else None
            if pattern is None:
                continue
            # 대체 문장은 사전이 정답이다. LLM이 지어낸 걸 쓰면 순화 문구가 매번 달라진다
            # (실측: "어떤 일 하실 때 제일 재밌으세요?" → "…더 깊이 있는 이야기를 나눠보세요").
            # replacement가 None인 유형(혐오·성적 발언·나이 비하)은 대체안 없이 '금지'만 안내한다.
            suggestion = pattern.replacement
        else:
            code = None
        quote = _resolve_quote(entry, lookup, own_utterances) if include_quotes else None
        cards.append(
            EvidenceCard(
                kind=kind,
                title=str(entry.get("title", "")).strip(),
                context=str(entry.get("context", "")).strip(),
                quote=quote,
                suggestion=suggestion,
                pattern_code=code,
            )
        )

    summary = str(data.get("summary", "")).strip()
    if not summary:
        # 요약이 비면 BE가 REPORT_RESULT_CONTRACT_INVALID(400)를 낸다 — COMPLETED인데
        # summaryText가 blank인 조합을 거부한다. 4xx는 재시도도 안 되므로 그 세션
        # 리포트가 통째로 사라진다. 문장을 못 받은 것뿐이니 FALLBACK으로 내린다.
        raise ReportLlmError("리포트 LLM이 요약 문장을 만들지 못했습니다")

    forbidden = _unmeasured_keywords(axes)
    narrative = ReportNarrative(
        summary=summary,
        strengths=_drop_unfounded(_as_str_tuple(data.get("strengths"), 3), forbidden),
        improvements=_drop_unfounded(_as_str_tuple(data.get("improvements"), 2), forbidden),
        missions=_drop_unfounded(_as_str_tuple(data.get("missions"), 3), forbidden),
        cards=tuple(cards[:MAX_CARDS]),
        generated_by_llm=True,
    )
    return _ensure_positive_card(_apply_goals(narrative, goals))


def _ensure_positive_card(narrative: ReportNarrative) -> ReportNarrative:
    """긍정 카드 최소 1개 보장(D-14). 없으면 강점 문장으로 하나 만든다."""
    if any(card.kind == "positive" for card in narrative.cards):
        return narrative
    seed = narrative.strengths[0] if narrative.strengths else "대화를 끝까지 이어간 점이 좋았어요."
    fallback = EvidenceCard(
        kind="positive",
        title="잘한 점",
        context=seed,
        quote=None,
        suggestion=None,
        pattern_code=None,
    )
    cards = (fallback,) + narrative.cards[: MAX_CARDS - 1]
    return ReportNarrative(
        summary=narrative.summary,
        strengths=narrative.strengths,
        improvements=narrative.improvements,
        missions=narrative.missions,
        cards=cards,
        generated_by_llm=narrative.generated_by_llm,
    )


def fallback_narrative(
    scores: ReportScores, speaker_id: str, *, goals: tuple[str, ...] = ()
) -> ReportNarrative:
    """LLM을 못 쓸 때의 규칙 기반 리포트. 수치만 담백하게 전달한다."""
    metrics = next((m for m in scores.metrics if m.speaker_id == speaker_id), None)
    measured = [a for a in scores.for_speaker(speaker_id) if a.measured and a.score is not None]
    axes = goal_axes(goals)
    strengths: list[str] = []
    improvements: list[str] = []
    if measured:
        best = max(measured, key=lambda a: a.score or 0.0)
        worst = min(measured, key=lambda a: a.score or 0.0)
        strengths.append(f"{best.axis}이(가) 이번 세션에서 가장 안정적이었어요.")
        improvements.append(f"{worst.axis}을(를) 다음 세션에서 조금 더 신경 써 보세요.")
    for axis in axes:
        # 목표 축이 최저점이 아니어서 개선점에 안 잡혔으면 여기서 넣어 준다.
        note = next((a.note for a in measured if a.axis == axis), None)
        if note is not None and not any(axis in item for item in improvements):
            improvements.insert(0, f"{axis}을(를) 고치고 싶다고 하셨어요. 이번엔 {note}였어요.")
    if metrics and metrics.backchannel_count > 0:
        strengths.append("상대 말에 맞장구로 반응한 구간이 있었어요.")
    if not strengths:
        strengths.append("대화를 끝까지 이어간 점이 좋았어요.")
    return _ensure_positive_card(
        _apply_goals(
            ReportNarrative(
                summary="이번 세션의 지표를 정리했어요. 자세한 설명은 잠시 후 다시 시도해 주세요.",
                strengths=tuple(strengths[:3]),
                improvements=tuple(improvements[:2]),
                missions=("다음 세션에서는 상대에게 한 번 더 되물어 보세요.",),
                cards=(),
                generated_by_llm=False,
            ),
            goals,
        )
    )


def build_narrative(
    report: ReportInput,
    scores: ReportScores,
    speaker_id: str,
    generator: TextGenerator,
    *,
    include_quotes: bool = False,
) -> ReportNarrative:
    """리포트 문장 생성. LLM이 실패하면 규칙 기반 폴백으로 내려간다.

    include_quotes 기본값이 False인 이유: 근거 발언 저장 동의(D-20)가 아직 미확정이다.
    동의가 확인된 세션에서만 True로 올린다.
    """
    prompt = build_prompt(report, scores, speaker_id, include_quotes=include_quotes)
    speaker = report.speaker(speaker_id)
    own_utterances = tuple(u.text for u in speaker.utterances) if speaker else ()
    goals = speaker_goals(report, speaker_id)
    try:
        raw = generator.generate(prompt)
        return parse_narrative(
            raw,
            include_quotes=include_quotes,
            own_utterances=own_utterances,
            quotable=quotable_index(report, speaker_id),
            axes=scores.for_speaker(speaker_id),
            goals=goals,
        )
    except ReportLlmError:
        return fallback_narrative(scores, speaker_id, goals=goals)
