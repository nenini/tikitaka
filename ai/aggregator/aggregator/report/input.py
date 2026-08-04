"""세션 종료 시 SessionState → ReportInput 스냅샷 (S15P11A307-488).

리포트 생성은 batch다. 통제실이 세션 내내 누적한 `state.utterances`(원문·화자·시각)를
종료 시점에 그대로 읽어 스냅샷을 뜬다. 이후 단계(scoring/builder)는 SessionState를
직접 보지 않고 이 스냅샷만 본다 — 상태가 계속 변하는 객체에 의존하지 않기 위해서다.

원문은 여기서 스냅샷에만 담기고, publish 후 폐기된다(§경계조건 3).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from aggregator.state import SessionState, Utterance


@dataclass(frozen=True)
class VisionInput:
    """화자 한 명의 비전 신호. vision 미수신 세션에서는 `available=False`.

    ⚠️ 세션 누적 지표는 **에피소드 횟수뿐**이다. 응시·미소의 누적 '시간'은 현재
    SessionState에 없다(`low_smile_observed_ms`는 코칭용 작업 변수라 미소가 나오면
    0으로 리셋된다 — 세션 총량이 아니다). 따라서 비언어·리액션 축은 비율이 아니라
    횟수 기반으로 환산한다(scoring 참고).
    """

    user_id: str
    available: bool
    behavior_counts: dict[str, int] = field(default_factory=dict)

    def count(self, event_type: str) -> int:
        return self.behavior_counts.get(event_type, 0)


@dataclass(frozen=True)
class SpeakerInput:
    speaker_id: str
    utterances: tuple[Utterance, ...]
    speaking_ms: int
    question_count: int
    filler_count: int


@dataclass(frozen=True)
class ReportInput:
    """리포트 생성의 유일한 입력. 이 시점 이후 SessionState는 참조하지 않는다."""

    session_id: str
    session_duration_ms: int
    speakers: tuple[SpeakerInput, ...]
    vision: tuple[VisionInput, ...]
    vision_enabled: bool
    """세션 features의 vision 사용 여부. False면 리액션·비언어 축은 '측정 부족'."""

    def speaker(self, speaker_id: str) -> SpeakerInput | None:
        for entry in self.speakers:
            if entry.speaker_id == speaker_id:
                return entry
        return None

    def vision_for(self, user_id: str) -> VisionInput | None:
        for entry in self.vision:
            if entry.user_id == user_id:
                return entry
        return None

    @property
    def all_utterances(self) -> tuple[Utterance, ...]:
        """두 화자의 발화를 시작 시각 순으로 병합한 단일 타임라인."""
        merged = [u for speaker in self.speakers for u in speaker.utterances]
        return tuple(sorted(merged, key=lambda u: (u.start_ms, u.end_ms)))


def build_report_input(
    state: SessionState,
    *,
    session_duration_ms: int | None = None,
    vision_enabled: bool = True,
) -> ReportInput:
    """SessionState를 얼려서 스냅샷으로 만든다.

    session_duration_ms를 안 주면 마지막 발화 종료 시각으로 대신한다
    (BE가 actualStartAt~endedAt을 주면 그 값을 쓰는 편이 정확하다).
    """
    speakers = tuple(
        SpeakerInput(
            speaker_id=speaker.speaker_id,
            utterances=tuple(speaker.utterances),
            speaking_ms=speaker.speaking_ms,
            question_count=speaker.question_count,
            filler_count=speaker.filler_count,
        )
        for speaker in state.speakers.values()
    )
    vision = tuple(
        VisionInput(
            user_id=user.user_id,
            available=user.vision_available,
            behavior_counts=dict(user.behavior_event_counts),
        )
        for user in state.vision_users.values()
    )
    duration = session_duration_ms
    if duration is None:
        duration = max((s.last_end_ms for s in state.speakers.values()), default=0)
    return ReportInput(
        session_id=state.session_id,
        session_duration_ms=max(0, duration),
        speakers=speakers,
        vision=vision,
        vision_enabled=vision_enabled,
    )
