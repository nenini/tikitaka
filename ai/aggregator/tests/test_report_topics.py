"""주제별 발화량 집계 — 결정적 계산이라 같은 입력이면 항상 같은 값이다."""

from __future__ import annotations

from itertools import count

from aggregator.report.topics import (
    CARRY_MAX_UTTERANCES,
    TOPIC_BACKCHANNEL,
    TOPIC_OTHER,
    assign_topics,
    build_topic_breakdown,
    classify,
    is_backchannel,
    topic_label,
)
from aggregator.state import Utterance

A = "user-A"
B = "user-B"

_SEQ = count(1)


def _u(speaker: str, start_ms: int, end_ms: int, text: str) -> Utterance:
    """Utterance(=TranscriptSegment)는 STT v2 신원 필드를 전부 요구한다.

    주제 집계가 보는 건 화자·시각·텍스트뿐이라 나머지는 자리만 채운다.
    """
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


# ── 사전 판정 ────────────────────────────────────────────────────


def test_classifies_the_main_topics() -> None:
    assert classify("취미가 어떻게 되세요?") == "HOBBY"
    assert classify("요즘 등산에 빠져 있어요") == "HOBBY"
    assert classify("무슨 일 하세요?") == "WORK"
    assert classify("저는 개발자예요") == "WORK"
    assert classify("맛집 아시는 데 있어요?") == "FOOD"
    assert classify("작년에 제주 여행 갔어요") == "TRAVEL"
    assert classify("안녕하세요 반갑습니다") == "GREETING"


def test_korean_particles_do_not_break_matching() -> None:
    """조사가 붙어도 잡혀야 한다 — 형태소 분석기 없이 부분일치로 간다."""
    for text in ("등산을 좋아해요", "등산이 취미예요", "등산 자주 가요"):
        assert classify(text) == "HOBBY"


def test_unmatched_text_defers_to_context() -> None:
    """사전에 없으면 None 이다 — 기타로 단정하지 않고 문맥에 맡긴다."""
    assert classify("저는 그냥 지하철 타고 왔어요") is None


# ── 맞장구 ───────────────────────────────────────────────────────


def test_backchannels_are_recognised() -> None:
    """실측 발화 40개 중 15개가 맞장구였다. 이걸 기타로 세면 막대가 무의미해진다."""
    for text in ("아 네", "그쵸", "아하", "맞아요 맞아요", "그렇군요", "음"):
        assert is_backchannel(text), text


def test_real_sentences_are_not_backchannels() -> None:
    for text in ("저는 등산을 좋아해요", "취미가 어떻게 되세요?"):
        assert not is_backchannel(text)


def test_backchannels_are_excluded_from_the_breakdown() -> None:
    timeline = (
        _u(A, 0, 6_000, "저는 등산을 좋아해요"),
        _u(A, 7_000, 8_000, "아 네"),
        _u(A, 9_000, 10_000, "그쵸"),
    )
    shares = build_topic_breakdown(timeline, A)

    assert [s.topic for s in shares] == ["HOBBY"]
    assert shares[0].utterance_count == 1


# ── 문맥 이어받기 ────────────────────────────────────────────────


def test_answer_inherits_the_question_topic_across_speakers() -> None:
    """A 가 묻고 B 가 답하면 B 의 답도 그 주제다.

    화자별로 따로 분류하면 B 의 "저는 개발자예요"가 문맥을 못 본다.
    """
    timeline = (
        _u(A, 0, 3_000, "일은 어떤 쪽 하세요?"),
        _u(B, 4_000, 7_000, "그냥 앉아서 하는 일이에요"),
    )
    assert assign_topics(timeline) == ["WORK", "WORK"]


def test_carry_over_is_bounded() -> None:
    """무제한 이어받기는 틀린 주제를 번지게 한다. 창을 넘으면 기타로 떨어진다."""
    timeline = (_u(A, 0, 3_000, "등산 좋아하세요?"),) + tuple(
        _u(A, (i + 1) * 4_000, (i + 1) * 4_000 + 3_000, f"그것도 괜찮은 것 같더라고요 {i}")
        for i in range(CARRY_MAX_UTTERANCES + 2)
    )
    assigned = assign_topics(timeline)

    assert assigned[0] == "HOBBY"
    assert assigned[1 : 1 + CARRY_MAX_UTTERANCES] == ["HOBBY"] * CARRY_MAX_UTTERANCES
    assert assigned[1 + CARRY_MAX_UTTERANCES] == TOPIC_OTHER


def test_greeting_does_not_bleed_into_later_talk() -> None:
    """첫인사는 국면이지 주제가 아니다.

    초기 실험에서 "안녕하세요" 뒤 5발화가 전부 첫인사로 딸려갔다.
    """
    timeline = (
        _u(A, 0, 2_000, "안녕하세요 반갑습니다"),
        _u(B, 3_000, 8_000, "지하철 타고 왔는데 생각보다 금방 왔어요"),
    )
    assert assign_topics(timeline) == ["GREETING", TOPIC_OTHER]


def test_backchannel_does_not_reset_the_context() -> None:
    """맞장구가 끼어도 주제는 이어진다 — 실제 대화가 그렇다."""
    timeline = (
        _u(A, 0, 3_000, "등산 좋아하세요?"),
        _u(B, 4_000, 5_000, "아 네"),
        _u(B, 6_000, 9_000, "가끔 다니는 편이에요"),
    )
    assert assign_topics(timeline) == ["HOBBY", TOPIC_BACKCHANNEL, "HOBBY"]


# ── 집계 ─────────────────────────────────────────────────────────


def test_breakdown_sums_speaking_time_per_topic() -> None:
    timeline = (
        _u(A, 0, 4_000, "취미가 어떻게 되세요?"),
        _u(A, 5_000, 11_000, "저는 등산을 좋아해요"),
        _u(A, 12_000, 14_000, "맛집도 잘 아세요?"),
    )
    by_topic = {s.topic: s for s in build_topic_breakdown(timeline, A)}

    assert by_topic["HOBBY"].speaking_ms == 10_000
    assert by_topic["HOBBY"].utterance_count == 2
    assert by_topic["FOOD"].speaking_ms == 2_000
    assert round(sum(s.ratio for s in by_topic.values()), 3) == 1.0


def test_only_the_requested_speaker_is_counted() -> None:
    timeline = (
        _u(A, 0, 5_000, "저는 등산을 좋아해요"),
        _u(B, 6_000, 12_000, "저는 여행을 좋아해요"),
    )
    assert [s.topic for s in build_topic_breakdown(timeline, A)] == ["HOBBY"]
    assert [s.topic for s in build_topic_breakdown(timeline, B)] == ["TRAVEL"]


def test_sorted_by_speaking_time_with_other_last() -> None:
    """화면 제일 위 막대가 '기타'면 정보가 아니다."""
    timeline = (
        _u(A, 0, 30_000, "그건 좀 애매하다고 생각하는 편입니다 아마도"),
        _u(A, 31_000, 36_000, "여행 좋아하세요?"),
        _u(A, 37_000, 39_000, "맛집 가고 싶네요"),
    )
    assert [s.topic for s in build_topic_breakdown(timeline, A)] == [
        "TRAVEL",
        "FOOD",
        TOPIC_OTHER,
    ]


def test_empty_input_produces_nothing() -> None:
    assert build_topic_breakdown((), A) == ()


def test_every_topic_has_a_korean_label() -> None:
    shares = build_topic_breakdown((_u(A, 0, 1_000, "여행 좋아해요"),), A)
    assert shares[0].label == "여행"
    assert topic_label("NOPE") == "기타"


def test_classification_is_stable() -> None:
    """LLM 이 아니라 사전이다 — 두 번 돌려도 같아야 성장 추이가 성립한다."""
    timeline = (_u(A, 0, 5_000, "등산 좋아해요"), _u(A, 6_000, 9_000, "맛집도요"))
    assert build_topic_breakdown(timeline, A) == build_topic_breakdown(timeline, A)
