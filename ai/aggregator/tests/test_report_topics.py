"""주제별 발화량 집계 — 결정적 계산이라 같은 입력이면 항상 같은 값이다."""

from __future__ import annotations

from itertools import count

from aggregator.report.topics import (
    TOPIC_OTHER,
    build_topic_breakdown,
    classify,
    topic_label,
)
from aggregator.state import Utterance

A = "user-A"


_SEQ = count(1)


def _u(start_ms: int, end_ms: int, text: str) -> Utterance:
    """Utterance(=TranscriptSegment)는 STT v2 신원 필드를 전부 요구한다.

    주제 집계가 보는 건 시각·텍스트뿐이라 나머지는 자리만 채운다.
    """
    seq = next(_SEQ)
    return Utterance(
        event_id=f"evt-{seq}",
        utterance_id=f"utt-{seq}",
        session_id="s1",
        user_id=A,
        participant_identity=f"identity-{A}",
        client_instance_id="11111111-1111-4111-8111-111111111111",
        seq=seq,
        start_ms=start_ms,
        end_ms=end_ms,
        text=text,
        confidence=0.9,
        language="ko",
        occurred_at="2026-08-03T14:00:00+09:00",
    )


def test_classifies_the_five_scenario_topics() -> None:
    assert classify("취미가 어떻게 되세요?") == "HOBBY"
    assert classify("요즘 등산에 빠져 있어요") == "HOBBY"
    assert classify("무슨 일 하세요?") == "WORK"
    assert classify("맛집 아시는 데 있어요?") == "FOOD"
    assert classify("작년에 제주 여행 갔어요") == "TRAVEL"
    assert classify("안녕하세요 반갑습니다") == "GREETING"


def test_korean_particles_do_not_break_matching() -> None:
    """조사가 붙어도 잡혀야 한다 — 형태소 분석기 없이 부분일치로 간다."""
    for text in ("등산을 좋아해요", "등산이 취미예요", "등산 자주 가요"):
        assert classify(text) == "HOBBY"


def test_unmatched_text_is_other() -> None:
    assert classify("음 글쎄요") == TOPIC_OTHER
    assert classify("") == TOPIC_OTHER


def test_breakdown_sums_speaking_time_per_topic() -> None:
    shares = build_topic_breakdown(
        (
            _u(0, 4_000, "취미가 어떻게 되세요?"),
            _u(5_000, 11_000, "저는 등산을 좋아해요"),
            _u(12_000, 14_000, "맛집도 잘 아세요?"),
        )
    )
    by_topic = {s.topic: s for s in shares}

    assert by_topic["HOBBY"].speaking_ms == 10_000
    assert by_topic["HOBBY"].utterance_count == 2
    assert by_topic["FOOD"].speaking_ms == 2_000
    assert round(sum(s.ratio for s in shares), 3) == 1.0


def test_sorted_by_speaking_time_with_other_last() -> None:
    """화면 제일 위 막대가 '기타'면 정보가 아니다."""
    shares = build_topic_breakdown(
        (
            _u(0, 30_000, "음 그러니까 뭐랄까"),   # OTHER, 가장 김
            _u(31_000, 36_000, "여행 좋아하세요?"),
            _u(37_000, 39_000, "맛집 가고 싶네요"),
        )
    )

    assert [s.topic for s in shares] == ["TRAVEL", "FOOD", TOPIC_OTHER]


def test_empty_input_produces_nothing() -> None:
    assert build_topic_breakdown(()) == ()


def test_every_topic_has_a_korean_label() -> None:
    shares = build_topic_breakdown((_u(0, 1_000, "여행 좋아해요"),))
    assert shares[0].label == "여행"
    assert topic_label("NOPE") == "기타"


def test_classification_is_stable() -> None:
    """LLM 이 아니라 사전이다 — 두 번 돌려도 같은 값이어야 성장 추이가 성립한다."""
    utterances = (_u(0, 5_000, "등산 좋아해요"), _u(6_000, 9_000, "맛집도요"))
    assert build_topic_breakdown(utterances) == build_topic_breakdown(utterances)
