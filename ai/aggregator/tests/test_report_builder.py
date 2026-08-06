"""리포트 문장 생성 검증 (S15P11A307-490·491) — 네트워크 없이 가짜 LLM으로.

핵심 관심사는 "LLM이 이상한 걸 뱉어도 리포트가 망가지지 않는가"다.
근거 없는 이슈 지적, 인용 금지 위반, JSON 깨짐, 서버 다운 — 전부 막혀야 한다.
"""

from __future__ import annotations

import json
from itertools import count

import pytest

from aggregator.report.builder import (
    DEFAULT_MISSION,
    DEFAULT_STRENGTH,
    _AXIS_KEYWORDS,
    MAX_CARDS,
    ReportLlmError,
    build_narrative,
    build_prompt,
    fallback_narrative,
    parse_narrative,
    quotable_index,
    verify_quote,
)
from aggregator.report.dictionary import avoid_pattern
from aggregator.report.input import ReportInput, SpeakerInput, VisionInput
from aggregator.report.scoring import SILENCE_THRESHOLD_MS, score_report
from aggregator.state import Utterance

A = "user-a"
B = "user-b"


_SEQ = count(1)


def _u(speaker: str, start_ms: int, end_ms: int, text: str) -> Utterance:
    """Utterance(=TranscriptSegment)는 STT v2 신원 필드를 전부 요구한다(§transcripts.py)."""
    seq = next(_SEQ)
    return Utterance(
        event_id=f"evt-{seq}",
        utterance_id=f"utt-{seq}",
        session_id="s1",
        user_id=speaker,
        participant_identity=f"identity-{speaker}",
        client_instance_id="11111111-1111-4111-8111-111111111111",
        seq=seq,
        start_ms=start_ms,
        end_ms=end_ms,
        text=text,
        confidence=0.9,
        language="ko",
        occurred_at="2026-08-03T14:00:00+09:00",
    )


def _report(*, vision: bool = True) -> ReportInput:
    mine = (_u(A, 0, 8_000, "안녕하세요 반가워요"), _u(A, 20_000, 30_000, "저는 운동을 좋아해요"))
    yours = (_u(B, 9_000, 18_000, "저도 반가워요"),)
    return ReportInput(
        session_id="s1",
        session_duration_ms=30 * 60 * 1000,
        speakers=(
            SpeakerInput(
                A,
                mine,
                sum(u.duration_ms for u in mine),
                2,
                4,
                {"뭐": 3, "음": 1},
            ),
            SpeakerInput(B, yours, sum(u.duration_ms for u in yours), 1, 1),
        ),
        vision=(
            VisionInput(A, vision, {"SMILE_STARTED": 6, "GAZE_AWAY_STARTED": 2},
                        1.0 if vision else 0.0),
            VisionInput(B, vision, {}, 1.0 if vision else 0.0),
        ),
        vision_enabled=vision,
    )


class _FakeLlm:
    def __init__(self, payload: object) -> None:
        self.payload = payload
        self.prompts: list[str] = []

    def generate(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if isinstance(self.payload, str):
            return self.payload
        return json.dumps(self.payload, ensure_ascii=False)


class _BrokenLlm:
    def generate(self, prompt: str) -> str:
        raise ReportLlmError("서버 다운")


def _good_payload() -> dict[str, object]:
    return {
        "summary": "편안하게 대화가 이어졌어요.",
        "strengths": ["되묻기가 자연스러웠어요", "취미 이야기로 공통점을 찾았어요", "리듬이 편안했어요"],
        "improvements": ["한 주제에 오래 머물렀어요", "발화가 조금 많았어요"],
        "missions": ["상대에게 한 번 더 되묻기"],
        "cards": [
            {"kind": "positive", "title": "되묻기", "context": "취미 이야기에서 되물었어요",
             "quote": None, "suggestion": None, "patternCode": None},
            {"kind": "issue", "title": "결혼 화제", "context": "직장 이야기 중 결혼으로 옮겼어요",
             "quote": "결혼은 언제쯤 하고 싶으세요?",
             "suggestion": "앞으로 어떤 삶을 살고 싶은지 궁금해요", "patternCode": "MARRIAGE_PRESSURE"},
        ],
    }


# ── 프롬프트 ─────────────────────────────────────────────────────────
def test_prompt_injects_computed_numbers() -> None:
    report = _report()
    scores = score_report(report)
    prompt = build_prompt(report, scores, A, include_quotes=False)
    assert "재계산 금지" in prompt
    assert "말 끊기" in prompt
    assert "MARRIAGE_PRESSURE" in prompt  # 사전이 프롬프트에 들어간다
    assert '"뭐" 3회' in prompt


def test_prompt_forbids_quotes_when_not_consented() -> None:
    report = _report()
    prompt = build_prompt(report, score_report(report), A, include_quotes=False)
    assert "인용하지 마라" in prompt


def test_prompt_allows_quotes_when_consented() -> None:
    """인용을 켜면 '번호를 고르라'고 시킨다 — 문장을 옮겨 적게 하지 않는다."""
    report = _report()
    prompt = build_prompt(report, score_report(report), A, include_quotes=True)
    assert "quoteRef" in prompt
    assert "직접 옮겨 적지 마라" in prompt


def test_prompt_numbers_only_own_utterances() -> None:
    """번호는 내 발언에만 붙는다 — 상대 발언은 애초에 고를 수 없어야 한다."""
    report = _report()
    prompt = build_prompt(report, score_report(report), A, include_quotes=True)
    transcript = prompt.split("## 대화 기록")[1]
    for line in transcript.splitlines():
        if "상대:" in line:
            assert not line.strip()[:1].isdigit()


def test_prompt_suppresses_vision_mentions_when_unmeasured() -> None:
    report = _report(vision=False)
    prompt = build_prompt(report, score_report(report), A, include_quotes=False)
    assert "표정·시선은 언급하지 마라" in prompt


def test_prompt_truncates_long_transcript() -> None:
    many = tuple(_u(A, i * 1_000, i * 1_000 + 500, f"발화{i}") for i in range(200))
    report = ReportInput("s1", 600_000, (SpeakerInput(A, many, 100_000, 0, 0),), (), True)
    prompt = build_prompt(report, score_report(report), A, include_quotes=False, transcript_limit=20)
    assert "중략" in prompt


# ── 파싱 ─────────────────────────────────────────────────────────────
def test_parse_valid_payload() -> None:
    narrative = parse_narrative(json.dumps(_good_payload(), ensure_ascii=False), include_quotes=True)
    assert narrative.generated_by_llm
    assert len(narrative.strengths) == 3
    assert len(narrative.improvements) == 2
    assert any(c.kind == "issue" for c in narrative.cards)


def test_issue_with_unknown_pattern_code_is_dropped() -> None:
    """사전에 없는 코드로 지적하면 근거가 없으므로 버린다."""
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "issue", "title": "지어낸 지적", "context": "근거 없음",
         "quote": None, "suggestion": None, "patternCode": "MADE_UP_CODE"},
    ]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=True)
    assert all(c.kind != "issue" for c in narrative.cards)


def test_issue_without_pattern_code_is_dropped() -> None:
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "issue", "title": "코드 없음", "context": "x",
         "quote": None, "suggestion": None, "patternCode": None},
    ]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=True)
    assert all(c.kind != "issue" for c in narrative.cards)


def test_quote_stripped_when_not_consented() -> None:
    """LLM이 규칙을 어기고 인용해도 파싱에서 잘라낸다."""
    narrative = parse_narrative(json.dumps(_good_payload(), ensure_ascii=False), include_quotes=False)
    assert all(card.quote is None for card in narrative.cards)


# ── 인용 검증 ────────────────────────────────────────────────────────
# LLM은 대화 기록을 보고 "비슷한 말"을 재구성한다(실측). 프롬프트 규칙은 확률적으로
# 새므로 코드가 막는다.
MINE = ("혹시 부모님은 어떤 일 하세요", "저는 주말엔 주로 등산을 가요")
YOURS = ("회사 선배가 계속 얘기해서 나왔어요",)


def _card_payload(quote: str) -> str:
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "issue", "title": "개인사 질문", "context": "x", "quote": quote,
         "suggestion": None, "patternCode": "PROBING_STATUS"},
    ]
    return json.dumps(payload, ensure_ascii=False)


def test_verbatim_quote_survives() -> None:
    assert verify_quote("혹시 부모님은 어떤 일 하세요", MINE) is not None


def test_partial_quote_survives() -> None:
    """긴 발화에서 한 대목만 따오는 건 정상이다."""
    assert verify_quote("주말엔 주로 등산을", MINE) is not None


def test_punctuation_and_spacing_differences_survive() -> None:
    """whisper 부호 유무·띄어쓰기 차이로 멀쩡한 인용이 죽으면 안 된다."""
    assert verify_quote("혹시 부모님은 어떤 일 하세요?", MINE) is not None
    assert verify_quote("혹시부모님은 어떤일하세요", MINE) is not None


def test_reworded_quote_is_rejected() -> None:
    """실측 사례 — 뜻은 같지만 한 글자도 일치하지 않는 창작."""
    assert verify_quote("부모님 직업은 어떻게 되세요?", MINE) is None


def test_partner_utterance_is_rejected() -> None:
    """실측 사례 — 상대 발화를 본인 근거로 붙였다."""
    assert verify_quote(YOURS[0], MINE) is None


def test_too_short_quote_is_rejected() -> None:
    """'네'·'맞아요'는 아무 발화에나 걸려 검증이 무의미하다."""
    assert verify_quote("네", MINE + ("네",)) is None


def test_fabricated_quote_is_dropped_but_card_survives() -> None:
    """인용만 떼고 카드는 살린다 — 지적 내용은 사전 코드로 이미 검증됐다."""
    narrative = parse_narrative(
        _card_payload("부모님 직업은 어떻게 되세요?"),
        include_quotes=True,
        own_utterances=MINE,
    )
    issues = [c for c in narrative.cards if c.kind == "issue"]
    assert len(issues) == 1
    assert issues[0].quote is None
    assert issues[0].pattern_code == "PROBING_STATUS"


def test_real_quote_is_kept() -> None:
    narrative = parse_narrative(
        _card_payload("혹시 부모님은 어떤 일 하세요"),
        include_quotes=True,
        own_utterances=MINE,
    )
    issues = [c for c in narrative.cards if c.kind == "issue"]
    assert issues[0].quote == "혹시 부모님은 어떤 일 하세요"


def test_quotes_dropped_when_transcript_not_supplied() -> None:
    """검증할 원문이 없으면 인용을 내보내지 않는다."""
    narrative = parse_narrative(_card_payload("혹시 부모님은 어떤 일 하세요"), include_quotes=True)
    assert all(card.quote is None for card in narrative.cards)


def test_build_narrative_verifies_against_own_utterances() -> None:
    """end-to-end — build_narrative가 화자 발화를 검증에 넘기는지."""
    report = _report()
    llm = _FakeLlm(json.loads(_card_payload("완전히 지어낸 문장이에요")))
    narrative = build_narrative(report, score_report(report), A, llm, include_quotes=True)
    assert all(card.quote is None for card in narrative.cards)


# ── 측정 부족 축 언급 차단 ───────────────────────────────────────────
def test_unmeasured_axis_mentions_are_dropped() -> None:
    """측정하지 않은 걸 좋다/나쁘다고 쓰면 거짓이다.

    실측: 축이 측정 부족인데 LLM이 그 축을 평가하는 문장을 냈다. (원래 사례는 질문
    축이었으나 2026-08-06부터 질문은 측정된다 — vision 미수신 축으로 옮겼다.)
    """
    report = _report(vision=False)
    axes = score_report(report).for_speaker(A)
    payload = _good_payload()
    payload["improvements"] = ["표정이 조금 굳어 있었어요", "한 주제에 오래 머물렀어요"]
    payload["missions"] = ["미소를 더 지어 보기", "새 주제를 꺼내 보기"]
    narrative = parse_narrative(
        json.dumps(payload, ensure_ascii=False), include_quotes=False, axes=axes
    )
    assert narrative.improvements == ("한 주제에 오래 머물렀어요",)
    assert narrative.missions == ("새 주제를 꺼내 보기",)


def test_measured_axis_mentions_survive() -> None:
    """측정된 축은 마음껏 언급해도 된다."""
    report = _report()
    axes = score_report(report).for_speaker(A)
    payload = _good_payload()
    payload["improvements"] = ["침묵 시간이 길었어요", "말 끊기가 있었어요"]
    narrative = parse_narrative(
        json.dumps(payload, ensure_ascii=False), include_quotes=False, axes=axes
    )
    assert len(narrative.improvements) == 2


def test_vision_mentions_dropped_when_vision_missing() -> None:
    report = _report(vision=False)
    axes = score_report(report).for_speaker(A)
    payload = _good_payload()
    payload["strengths"] = ["미소가 자연스러웠어요", "시선을 잘 맞췄어요", "리듬이 편안했어요"]
    narrative = parse_narrative(
        json.dumps(payload, ensure_ascii=False), include_quotes=False, axes=axes
    )
    assert narrative.strengths == ("리듬이 편안했어요",)


def test_no_axes_means_no_filtering() -> None:
    """axes를 안 주면 검사하지 않는다(기존 호출부 호환)."""
    payload = _good_payload()
    payload["improvements"] = ["질문의 다양성이 부족했어요"]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=False)
    assert narrative.improvements == ("질문의 다양성이 부족했어요",)


def test_weak_axis_is_flagged_in_prompt() -> None:
    """낮은 점수 축을 프롬프트에 표시해야 LLM이 포장하지 않는다."""
    report = _report()
    prompt = build_prompt(report, score_report(report), A, include_quotes=False)
    assert "낮음. 요약과 개선점에서 반드시 언급하라" in prompt or "측정 부족. 언급하지 마라" in prompt


# ── 대체 문장(순화) — 사전이 정답 ───────────────────────────────────
def test_suggestion_comes_from_dictionary_not_llm() -> None:
    """LLM이 다른 문장을 써도 사전값으로 덮어쓴다.

    실측: PROBING_STATUS 사전값은 "어떤 일 하실 때 제일 재밌으세요?"인데
    LLM은 "…더 깊이 있는 이야기를 나눠보세요"를 냈다. 순화 문구가 매번 달라지면 안 된다.
    """
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "issue", "title": "개인사 질문", "context": "x", "quote": None,
         "suggestion": "LLM이 지어낸 엉뚱한 제안", "patternCode": "PROBING_STATUS"},
    ]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=False)
    issue = next(c for c in narrative.cards if c.kind == "issue")
    assert issue.suggestion == avoid_pattern("PROBING_STATUS").replacement  # type: ignore[union-attr]


def test_no_suggestion_for_patterns_without_replacement() -> None:
    """혐오·성적 발언·나이 비하는 대체안 없이 '금지'만 안내한다."""
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "issue", "title": "혐오 발언", "context": "x", "quote": None,
         "suggestion": "LLM이 만든 대체 문장", "patternCode": "HATE"},
    ]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=False)
    assert next(c for c in narrative.cards if c.kind == "issue").suggestion is None


def test_non_issue_card_keeps_llm_suggestion() -> None:
    """사전에 정답이 없는 카드 종류는 LLM 문장을 그대로 쓴다."""
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "behavior", "title": "되묻기", "context": "x", "quote": None,
         "suggestion": "한 번 더 되물어 보세요", "patternCode": None},
    ]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=False)
    card = next(c for c in narrative.cards if c.kind == "behavior")
    assert card.suggestion == "한 번 더 되물어 보세요"


# ── 번호 참조(quoteRef) — 인용의 정상 경로 ──────────────────────────
def _ref_payload(ref: object) -> str:
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "issue", "title": "개인사 질문", "context": "x", "quoteRef": ref,
         "suggestion": None, "patternCode": "PROBING_STATUS"},
    ]
    return json.dumps(payload, ensure_ascii=False)


def test_quotable_index_covers_own_utterances_only() -> None:
    report = _report()
    index = quotable_index(report, A)
    assert set(index.values()) == {"안녕하세요 반가워요", "저는 운동을 좋아해요"}


def test_quote_ref_resolves_to_original_text() -> None:
    """LLM은 번호만 고르고 원문은 코드가 붙인다."""
    report = _report()
    index = quotable_index(report, A)
    ref = next(iter(index))
    narrative = parse_narrative(_ref_payload(ref), include_quotes=True, quotable=index)
    issue = next(c for c in narrative.cards if c.kind == "issue")
    assert issue.quote == index[ref]


def test_quote_ref_pointing_at_partner_is_dropped() -> None:
    """상대 발화 번호를 고르면 표에 없으므로 인용이 붙지 않는다."""
    report = _report()
    index = quotable_index(report, A)
    partner_ref = next(
        i for i, u in enumerate(report.all_utterances) if u.speaker_id == B
    )
    narrative = parse_narrative(_ref_payload(partner_ref), include_quotes=True, quotable=index)
    assert all(card.quote is None for card in narrative.cards)


def test_out_of_range_quote_ref_is_dropped() -> None:
    report = _report()
    narrative = parse_narrative(
        _ref_payload(999), include_quotes=True, quotable=quotable_index(report, A)
    )
    assert all(card.quote is None for card in narrative.cards)


def test_quote_ref_as_string_is_accepted() -> None:
    """LLM이 숫자를 문자열로 싸서 보내는 일이 잦다."""
    report = _report()
    index = quotable_index(report, A)
    ref = next(iter(index))
    narrative = parse_narrative(_ref_payload(str(ref)), include_quotes=True, quotable=index)
    assert next(c for c in narrative.cards if c.kind == "issue").quote == index[ref]


def test_garbage_quote_ref_is_dropped() -> None:
    report = _report()
    index = quotable_index(report, A)
    for junk in ("발화 번호", True, None):
        narrative = parse_narrative(_ref_payload(junk), include_quotes=True, quotable=index)
        assert all(card.quote is None for card in narrative.cards)


def test_quote_ref_ignored_when_not_consented() -> None:
    report = _report()
    index = quotable_index(report, A)
    ref = next(iter(index))
    narrative = parse_narrative(_ref_payload(ref), include_quotes=False, quotable=index)
    assert all(card.quote is None for card in narrative.cards)


def test_positive_card_is_guaranteed() -> None:
    """D-14 — 이슈만 있어도 긍정 카드가 최소 1개 남는다."""
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "issue", "title": "결혼 화제", "context": "x", "quote": None,
         "suggestion": None, "patternCode": "MARRIAGE_PRESSURE"},
    ]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=True)
    assert sum(1 for c in narrative.cards if c.kind == "positive") >= 1


def test_cards_capped() -> None:
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "behavior", "title": f"카드{i}", "context": "x",
         "quote": None, "suggestion": None, "patternCode": None}
        for i in range(20)
    ]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=True)
    assert len(narrative.cards) <= MAX_CARDS


def test_unknown_card_kind_is_dropped() -> None:
    payload = _good_payload()
    payload["cards"] = [
        {"kind": "made_up", "title": "x", "context": "x",
         "quote": None, "suggestion": None, "patternCode": None},
    ]
    narrative = parse_narrative(json.dumps(payload, ensure_ascii=False), include_quotes=True)
    assert all(c.kind in {"issue", "behavior", "positive", "filler"} for c in narrative.cards)


def test_non_json_response_raises() -> None:
    with pytest.raises(ReportLlmError):
        parse_narrative("이건 JSON이 아닙니다", include_quotes=False)


def test_non_object_json_raises() -> None:
    with pytest.raises(ReportLlmError):
        parse_narrative("[1, 2, 3]", include_quotes=False)


# ── 폴백 ─────────────────────────────────────────────────────────────
def test_build_narrative_falls_back_when_llm_down() -> None:
    report = _report()
    narrative = build_narrative(report, score_report(report), A, _BrokenLlm())
    assert not narrative.generated_by_llm
    assert narrative.strengths  # 폴백도 긍정은 남긴다
    assert any(c.kind == "positive" for c in narrative.cards)


def test_fallback_mentions_best_and_worst_axis() -> None:
    report = _report()
    narrative = fallback_narrative(score_report(report), A)
    assert narrative.strengths and narrative.improvements
    assert not narrative.generated_by_llm


def test_build_narrative_happy_path() -> None:
    report = _report()
    llm = _FakeLlm(_good_payload())
    narrative = build_narrative(report, score_report(report), A, llm, include_quotes=True)
    assert narrative.generated_by_llm
    assert llm.prompts and "측정 결과" in llm.prompts[0]


# ── 설문 목표 개인화 (S15P11A307-488) ────────────────────────────────
# 점수는 절대 안 바뀐다. 바뀌는 건 어느 축을 먼저 보여주고 어떻게 부르느냐뿐이다.

def _report_with_goals(*goals: str) -> ReportInput:
    """A에게만 설문 목표를 붙인 리포트 입력."""
    base = _report()
    speakers = tuple(
        SpeakerInput(
            s.speaker_id,
            s.utterances,
            s.speaking_ms,
            s.question_count,
            s.filler_count,
            s.filler_breakdown,
            goals if s.speaker_id == A else (),
        )
        for s in base.speakers
    )
    return ReportInput(
        session_id=base.session_id,
        session_duration_ms=base.session_duration_ms,
        speakers=speakers,
        vision=base.vision,
        vision_enabled=base.vision_enabled,
    )


def test_goal_axis_moves_to_front_of_improvements() -> None:
    """'말이 너무 많아요'를 고르면 대화균형 문장이 개선점 1번으로 온다."""
    payload = _good_payload()
    payload["improvements"] = ["한 주제에 오래 머물렀어요", "발화 비율이 조금 높았어요"]
    narrative = parse_narrative(
        json.dumps(payload, ensure_ascii=False),
        include_quotes=False,
        goals=("TALK_TOO_MUCH",),
    )
    assert narrative.improvements[0] == "발화 비율이 조금 높았어요"


def test_goal_axis_dropped_from_strengths() -> None:
    """고민이라고 답한 축은 점수가 좋아도 강점으로 내세우지 않는다."""
    payload = _good_payload()
    payload["strengths"] = ["발화 비율이 균형 잡혔어요", "리듬이 편안했어요"]
    narrative = parse_narrative(
        json.dumps(payload, ensure_ascii=False),
        include_quotes=False,
        goals=("TALK_TOO_LITTLE",),
    )
    assert "발화 비율이 균형 잡혔어요" not in narrative.strengths
    assert "리듬이 편안했어요" in narrative.strengths


def test_goal_never_empties_strengths() -> None:
    """전부 목표 축 문장이면 지우지 않는다 — 강점 0개가 더 나쁘다."""
    payload = _good_payload()
    payload["strengths"] = ["발화 비율이 좋았어요"]
    narrative = parse_narrative(
        json.dumps(payload, ensure_ascii=False),
        include_quotes=False,
        goals=("TALK_TOO_MUCH",),
    )
    assert narrative.strengths == ("발화 비율이 좋았어요",)


def test_unmeasurable_goal_is_ignored() -> None:
    """음량은 측정 지표가 없다. 목표로 받아도 아무것도 바꾸지 않는다."""
    payload = _good_payload()
    payload["strengths"] = ["발화 비율이 균형 잡혔어요", "리듬이 편안했어요"]
    with_voice = parse_narrative(
        json.dumps(payload, ensure_ascii=False),
        include_quotes=False,
        goals=("VOICE_TOO_LOUD", "VOICE_TOO_QUIET", "OTHER"),
    )
    without = parse_narrative(
        json.dumps(payload, ensure_ascii=False), include_quotes=False
    )
    assert with_voice.strengths == without.strengths
    assert with_voice.improvements == without.improvements


def test_prompt_carries_goal_and_hides_unmeasurable() -> None:
    report = _report_with_goals("TALK_TOO_MUCH", "VOICE_TOO_LOUD")
    prompt = build_prompt(report, score_report(report), A, include_quotes=False)
    section = prompt.split("## 사용자가 미리 고민이라고 답한 것")[1].split("##")[0]
    assert "말이 너무 많다고 느낀다" in section
    # 못 재는 목표는 섹션에 안 넣는다 — 알려주면 LLM이 목소리 크기를 지어낸다
    assert "목소리" not in section


def test_prompt_without_goal_has_no_goal_section() -> None:
    report = _report()
    prompt = build_prompt(report, score_report(report), A, include_quotes=False)
    assert "고민이라고 답한 것" not in prompt


def test_fallback_personalizes_mission_and_improvement() -> None:
    """LLM이 죽어도 개인화는 남는다 — 폴백은 규칙 기반이라 더 확실하다."""
    report = _report_with_goals("TALK_TOO_MUCH")
    narrative = build_narrative(report, score_report(report), A, _BrokenLlm())
    assert not narrative.generated_by_llm
    assert "셋을 세고" in narrative.missions[0]
    assert "대화균형" in narrative.improvements[0]


def test_scores_are_untouched_by_goals() -> None:
    """개인화는 문장만 건드린다. 축 점수가 달라지면 성장추이가 무너진다."""
    plain = score_report(_report())
    goaled = score_report(_report_with_goals("TALK_TOO_MUCH"))
    assert [(a.axis, a.score) for a in plain.for_speaker(A)] == [
        (a.axis, a.score) for a in goaled.for_speaker(A)
    ]


def test_conflicting_goals_cancel_out() -> None:
    """'많다'와 '적다'를 함께 고르면 개인화를 포기한다 — 다중선택이라 가능한 조합이다.

    그대로 두면 "말을 줄이세요"와 "더 말하세요"가 한 리포트에 같이 실린다(2026-08-05 실측).
    """
    both = ("TALK_TOO_MUCH", "TALK_TOO_LITTLE")
    report = _report_with_goals(*both)
    narrative = build_narrative(report, score_report(report), A, _BrokenLlm())
    plain = build_narrative(_report(), score_report(_report()), A, _BrokenLlm())
    assert narrative.missions == plain.missions
    assert narrative.improvements == plain.improvements


def test_llm_missions_get_goal_mission_first() -> None:
    """LLM 경로에서도 미션이 개인화된다. 첫 자리는 사전이 가져간다."""
    payload = _good_payload()
    payload["missions"] = ["상대에게 한 번 더 되묻기", "발화량을 줄여보기"]
    narrative = parse_narrative(
        json.dumps(payload, ensure_ascii=False),
        include_quotes=False,
        goals=("TALK_TOO_MUCH",),
    )
    assert narrative.missions[0] == "상대가 말을 마친 뒤 속으로 셋을 세고 입을 여세요."
    assert "상대에게 한 번 더 되묻기" in narrative.missions
    assert len(narrative.missions) <= 3


def test_empty_summary_falls_back_instead_of_sending_blank() -> None:
    """요약이 비면 COMPLETED로 내보내지 않는다.

    BE는 COMPLETED인데 summaryText가 blank면 REPORT_RESULT_CONTRACT_INVALID(400)를 낸다.
    4xx는 재시도가 없어 그 세션 리포트가 통째로 사라진다. 문장만 못 받은 것이므로
    규칙 기반 FALLBACK으로 내리는 게 맞다.
    """
    payload = _good_payload()
    payload["summary"] = "   "
    report = _report()
    narrative = build_narrative(report, score_report(report), A, _FakeLlm(payload))
    assert not narrative.generated_by_llm
    assert narrative.summary.strip()


def test_filters_never_leave_arrays_empty() -> None:
    """미측정 축 표현만으로 채워 와도 세 배열이 비지 않는다.

    질문균형은 항상 측정 부족이라 '질문·되묻·물어'가 든 문장은 전부 지워진다.
    LLM이 그런 문장만 보내면 강점·개선점·미션이 0개로 나갔다(2026-08-05 실측).
    """
    payload = _good_payload()
    payload["strengths"] = ["되묻기가 자연스러웠어요"]
    payload["improvements"] = ["질문이 조금 적었어요"]
    payload["missions"] = ["상대에게 한 번 더 되물어 보기"]
    report = _report()
    narrative = build_narrative(report, score_report(report), A, _FakeLlm(payload))
    assert narrative.strengths
    assert narrative.improvements
    assert narrative.missions


def test_floor_text_survives_its_own_filter() -> None:
    """바닥 문구가 미측정 축 단어를 쓰면 도로 지워져 무의미해진다."""
    forbidden = _AXIS_KEYWORDS["질문균형"]
    assert not any(word in DEFAULT_STRENGTH for word in forbidden)
    assert not any(word in DEFAULT_MISSION for word in forbidden)


def test_prompt_example_does_not_teach_filtered_wording() -> None:
    """예시가 지워질 표현을 가르치면 LLM이 그대로 베껴 배열이 빈다."""
    report = _report()
    spec = build_prompt(report, score_report(report), A, include_quotes=False)
    example = spec.split("## 출력 형식")[1].split("필드 규칙")[0]
    assert "되묻" not in example
    assert "되물" not in example


def test_prompt_silence_label_matches_the_threshold() -> None:
    """프롬프트가 말하는 초와 실제로 센 기준이 같아야 한다.

    임계값을 15초→10초로 내린 뒤에도 프롬프트 라벨만 '15초 이상 침묵'으로 남아
    LLM에게 틀린 기준을 알려주고 있었다. 문장에 "15초 넘게 침묵하셨어요"가 섞여 나간다.
    """
    report = _report()
    prompt = build_prompt(report, score_report(report), A, include_quotes=False)
    assert f"{SILENCE_THRESHOLD_MS // 1000}초 이상 침묵" in prompt
    assert "15초 이상 침묵" not in prompt
