"""대화 주제별 발화량 집계. **LLM 개입 0.**

리포트 정책이 "수치는 코드, 문장은 LLM"이다. 주제 비중은 화면에 막대로 그려지는
수치라 결정적으로 계산한다. LLM 에 분류를 맡기면 같은 세션을 두 번 돌릴 때 값이
달라져 성장 추이(BE)가 무너진다.

형태소 분석기를 쓰지 않는다. aggregator 의존성은 fastapi/httpx/livekit/pydantic/numpy
뿐이고, konlpy·mecab 은 설치·배포 비용이 크다. 한국어는 어간에 조사가 붙으므로
`in` 부분일치로도 충분히 잡힌다("등산을", "등산이", "등산 갔어요" 전부 "등산"을 포함).

부분일치의 대가는 오탐이다. 그래서 사전을 **좁게** 유지한다 — 애매한 낱말("좋아",
"시간")은 넣지 않는다. 어디에도 안 걸리면 기타로 두고, 기타가 커도 그건 사실이다.
"""

from __future__ import annotations

from dataclasses import dataclass

from aggregator.report.input import ReportInput
from aggregator.state import Utterance

TOPIC_OTHER = "OTHER"

_TOPIC_LABELS: dict[str, str] = {
    "GREETING": "첫인사·소개",
    "HOBBY": "취미·여가",
    "WORK": "일·학업",
    "FOOD": "음식",
    "TRAVEL": "여행",
    "MEDIA": "영화·음악",
    "DAILY": "일상·주말",
    TOPIC_OTHER: "기타",
}

_TOPIC_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    # 순서가 우선순위다. 한 발화는 가장 먼저 걸리는 주제 하나로만 센다.
    ("GREETING", ("안녕하세", "반갑", "처음 뵙", "소개", "성함", "이름이", "나이가", "몇 살")),
    ("TRAVEL", ("여행", "여행지", "해외", "국내여행", "제주", "휴가", "비행기", "관광", "숙소")),
    ("FOOD", ("음식", "맛집", "먹는", "먹었", "먹어", "요리", "카페", "커피", "술", "맥주", "디저트", "메뉴")),
    ("MEDIA", ("영화", "드라마", "음악", "노래", "가수", "배우", "넷플릭스", "유튜브", "웹툰", "공연")),
    ("HOBBY", ("취미", "운동", "등산", "헬스", "러닝", "요가", "독서", "게임", "그림", "사진", "악기", "낚시", "캠핑", "전시")),
    # "무슨 일 하세요"처럼 띄어 쓰는 형태가 흔해서 어간만으로는 안 잡힌다.
    ("WORK", ("일하", "일 하", "하는 일", "무슨 일", "직장", "회사", "직업", "전공",
              "학교", "학과", "대학", "취업", "면접", "야근", "출근", "프로젝트")),
    ("DAILY", ("주말", "평일", "요즘", "쉬는 날", "퇴근하고", "집에서", "루틴")),
)


@dataclass(frozen=True)
class TopicShare:
    """한 주제의 발화 비중. `ratio`는 그 화자 전체 발화 시간 대비다."""

    topic: str
    label: str
    utterance_count: int
    speaking_ms: int
    ratio: float


def classify(text: str) -> str:
    """발화 하나를 주제 하나로 분류한다. 못 고르면 기타."""
    lowered = text.strip()
    if not lowered:
        return TOPIC_OTHER
    for topic, keywords in _TOPIC_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return topic
    return TOPIC_OTHER


def topic_label(topic: str) -> str:
    return _TOPIC_LABELS.get(topic, _TOPIC_LABELS[TOPIC_OTHER])


def build_topic_breakdown(
    utterances: tuple[Utterance, ...],
) -> tuple[TopicShare, ...]:
    """화자 한 명의 발화를 주제별로 묶는다. 발화 시간 내림차순.

    기타는 항상 마지막에 둔다 — 화면에서 제일 큰 막대가 "기타"인 건 정보가 아니다.
    """
    counts: dict[str, int] = {}
    durations: dict[str, int] = {}
    for utterance in utterances:
        topic = classify(utterance.text)
        counts[topic] = counts.get(topic, 0) + 1
        durations[topic] = durations.get(topic, 0) + utterance.duration_ms

    total_ms = sum(durations.values())
    shares = [
        TopicShare(
            topic=topic,
            label=topic_label(topic),
            utterance_count=counts[topic],
            speaking_ms=durations[topic],
            ratio=round(durations[topic] / total_ms, 3) if total_ms else 0.0,
        )
        for topic in durations
    ]
    shares.sort(key=lambda s: (s.topic == TOPIC_OTHER, -s.speaking_ms))
    return tuple(shares)


def topic_breakdowns(report: ReportInput) -> dict[str, tuple[TopicShare, ...]]:
    """화자별 주제 비중. speaker_id → 주제 목록."""
    return {
        speaker.speaker_id: build_topic_breakdown(speaker.utterances)
        for speaker in report.speakers
    }


__all__ = [
    "TOPIC_OTHER",
    "TopicShare",
    "build_topic_breakdown",
    "classify",
    "topic_breakdowns",
    "topic_label",
]
