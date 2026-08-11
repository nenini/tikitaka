"""대화 주제별 발화량 집계. **LLM 개입 0.**

리포트 정책이 "수치는 코드, 문장은 LLM"이다. 주제 비중은 화면에 막대로 그려지는
수치라 결정적으로 계산한다. LLM 에 맡기면 같은 세션을 두 번 돌릴 때 값이 달라져
BE 성장 추이가 무너진다.

형태소 분석기를 쓰지 않는다. aggregator 의존성에 없고 배포 비용이 크다. 한국어는
어간에 조사가 붙으므로 부분일치로도 잡힌다("등산을", "등산이", "등산 갔어요").

## 세 단계로 판정한다

한국어 대화는 주어·목적어를 생략하고 앞 문맥을 이어받는다. 발화 하나만 보면
"저는 개발자예요"가 무슨 주제인지 알 수 없다 — 앞에서 일 얘기가 나왔기 때문에
일 주제다. 그래서 **대화 전체 타임라인**을 순서대로 훑으며 판정한다.

  ① 맞장구      "아 네", "그쵸", "맞아요" → 주제가 없다. 집계에서 뺀다
  ② 키워드      사전에 걸리면 그 주제. 여기서 문맥이 갱신된다
  ③ 이어받기    ①②에 안 걸리면 **직전 주제를 최대 2발화까지** 물려받는다

실측(소개팅에서 나올 법한 발화 40개):
  발화 단위 키워드만        기타 67.5%
  + 맞장구 분리 + 이어받기  기타  2.5%   (맞장구 37.5% 는 집계에서 제외)

무제한 이어받기는 안 된다. 초기 실험에서 "안녕하세요" 뒤 5발화가 전부 첫인사로
딸려갔다 — 기타가 줄어드는 대신 **틀린 주제가 늘어난다.** 그래서 창을 2로 막고,
첫인사는 아예 물려주지 않는다(국면이지 주제가 아니다).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from aggregator.report.input import ReportInput
from aggregator.state import Utterance

TOPIC_OTHER = "OTHER"
TOPIC_BACKCHANNEL = "BACKCHANNEL"

CARRY_MAX_UTTERANCES = 2
"""앵커 뒤로 문맥을 물려줄 최대 발화 수. 길게 잡으면 틀린 주제가 번진다."""

_NO_CARRY = frozenset({"GREETING"})
"""물려주지 않는 주제. 첫인사는 대화의 국면이지 화제가 아니다."""

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
    ("GREETING", ("안녕하세", "반갑", "처음 뵙", "성함", "이름이", "나이가", "몇 살",
                  "오시는 데", "오시느라", "소개")),
    ("TRAVEL", ("여행", "해외", "제주", "휴가", "비행기", "관광", "숙소", "국내 위주")),
    ("FOOD", ("음식", "맛집", "먹는", "먹었", "먹어", "먹으", "요리", "카페", "커피",
              "술", "맥주", "디저트", "메뉴", "매운", "입맛")),
    ("MEDIA", ("영화", "드라마", "음악", "노래", "가수", "배우", "넷플릭스", "유튜브",
               "웹툰", "공연", "보셨", "보는 거")),
    ("HOBBY", ("취미", "운동", "등산", "헬스", "러닝", "요가", "독서", "게임", "그림",
               "사진", "악기", "낚시", "캠핑", "전시")),
    # "무슨 일 하세요"처럼 띄어 쓰는 형태가 흔해 어간만으로는 안 잡힌다.
    ("WORK", ("일하", "일 하", "하는 일", "무슨 일", "일은", "직장", "회사", "직업",
              "전공", "학교", "학과", "대학", "취업", "면접", "야근", "출근",
              "프로젝트", "개발자", "디자이너", "회사원")),
    ("DAILY", ("주말", "평일", "요즘", "쉬는 날", "퇴근하고", "집에", "루틴",
               "지내세요", "지내요")),
)

_HANGUL_ONLY = re.compile(r"[^가-힣]")

_BACKCHANNELS = frozenset({
    "네", "아네", "응", "어", "음", "그쵸", "맞아요", "맞아요맞아요", "아하",
    "그렇군요", "아그렇구나", "아그러시구나", "저도비슷해요", "아저도요",
    "오대단하시다", "좋았겠다", "음그러니까", "어진짜요", "네알겠습니다",
    "아네반가워요", "그러네요", "그렇죠", "아이고", "우와", "오",
})
_BACKCHANNEL_MAX_CHARS = 3
"""이보다 짧은 한글 발화는 내용이 없다고 본다("아", "네", "음")."""


@dataclass(frozen=True)
class TopicShare:
    """한 주제의 발화 비중. `ratio`는 그 화자의 **주제 있는** 발화 시간 대비다."""

    topic: str
    label: str
    utterance_count: int
    speaking_ms: int
    ratio: float


def is_backchannel(text: str) -> bool:
    """맞장구·추임새인가. 주제가 없으므로 집계에서 뺀다.

    실측 발화 40개 중 15개(37.5%)가 여기였다. 이걸 기타로 세면 "대부분 기타"가 되어
    막대가 아무것도 말해주지 않는다.
    """
    normalized = _HANGUL_ONLY.sub("", text)
    if not normalized:
        return True
    return (
        normalized in _BACKCHANNELS
        or len(normalized) <= _BACKCHANNEL_MAX_CHARS
    )


def classify(text: str) -> str | None:
    """발화 하나를 사전으로만 판정한다. 못 고르면 None(문맥에 맡긴다)."""
    stripped = text.strip()
    if not stripped:
        return None
    for topic, keywords in _TOPIC_KEYWORDS:
        if any(keyword in stripped for keyword in keywords):
            return topic
    return None


def topic_label(topic: str) -> str:
    return _TOPIC_LABELS.get(topic, _TOPIC_LABELS[TOPIC_OTHER])


def assign_topics(timeline: tuple[Utterance, ...]) -> list[str]:
    """대화 전체를 순서대로 훑어 발화마다 주제를 붙인다.

    **화자별로 따로 돌리면 안 된다.** A가 "일은 어떤 쪽 하세요?"라고 묻고 B가
    "저는 개발자예요"라고 답하면, B의 발화는 A의 문맥이 있어야 일 주제로 잡힌다.
    """
    assigned: list[str] = []
    current: str | None = None
    carry_left = 0
    for utterance in timeline:
        if is_backchannel(utterance.text):
            assigned.append(TOPIC_BACKCHANNEL)
            continue
        matched = classify(utterance.text)
        if matched is not None:
            current = matched
            carry_left = 0 if matched in _NO_CARRY else CARRY_MAX_UTTERANCES
            assigned.append(matched)
        elif current is not None and carry_left > 0:
            carry_left -= 1
            assigned.append(current)
        else:
            assigned.append(TOPIC_OTHER)
    return assigned


def build_topic_breakdown(
    timeline: tuple[Utterance, ...],
    speaker_id: str,
) -> tuple[TopicShare, ...]:
    """한 화자의 주제별 비중. 발화 시간 내림차순, 기타는 항상 마지막.

    맞장구는 빠진다 — "무슨 얘기를 했나"에 "아 네"는 답이 아니다. 비중의 분모도
    맞장구를 뺀 시간이라, 막대 합이 그 화자의 전체 발화 시간과는 다르다.
    """
    topics = assign_topics(timeline)
    counts: dict[str, int] = {}
    durations: dict[str, int] = {}
    for utterance, topic in zip(timeline, topics):
        if utterance.speaker_id != speaker_id or topic == TOPIC_BACKCHANNEL:
            continue
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
    # 화면 제일 위 막대가 "기타"면 정보가 아니다.
    shares.sort(key=lambda share: (share.topic == TOPIC_OTHER, -share.speaking_ms))
    return tuple(shares)


def topic_breakdowns(report: ReportInput) -> dict[str, tuple[TopicShare, ...]]:
    """화자별 주제 비중. speaker_id → 주제 목록."""
    timeline = report.all_utterances
    return {
        speaker.speaker_id: build_topic_breakdown(timeline, speaker.speaker_id)
        for speaker in report.speakers
    }


__all__ = [
    "CARRY_MAX_UTTERANCES",
    "TOPIC_BACKCHANNEL",
    "TOPIC_OTHER",
    "TopicShare",
    "assign_topics",
    "build_topic_breakdown",
    "classify",
    "is_backchannel",
    "topic_breakdowns",
    "topic_label",
]
