"""세션 종료 시 SessionState → ReportInput 스냅샷 (S15P11A307-488).

리포트 생성은 batch다. 통제실이 세션 내내 누적한 `state.utterances`(원문·화자·시각)를
종료 시점에 그대로 읽어 스냅샷을 뜬다. 이후 단계(scoring/builder)는 SessionState를
직접 보지 않고 이 스냅샷만 본다 — 상태가 계속 변하는 객체에 의존하지 않기 위해서다.

원문은 여기서 스냅샷에만 담기고, publish 후 폐기된다(§경계조건 3).
"""

from __future__ import annotations

import logging

from dataclasses import dataclass, field

from aggregator.state import SessionState, Utterance, VisionUserState

logger = logging.getLogger(__name__)

_LOW_COVERAGE = 0.70
"""이 아래면 사유를 로그로 남긴다. `scoring.VISION_COVERAGE_THRESHOLD` 와 같은 값이다
— scoring 이 input 을 import 하므로 여기서 거꾸로 import 하면 순환이다."""


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
    coverage: float | None = None
    observation_window_ms: float = 0.0
    """브라우저 비전이 관측을 시도한 총 시간. 세션 길이로 나누면 카메라 가동 비율이다."""

    def count(self, event_type: str) -> int:
        return self.behavior_counts.get(event_type, 0)


@dataclass(frozen=True)
class SpeakerInput:
    speaker_id: str
    utterances: tuple[Utterance, ...]
    speaking_ms: int
    question_count: int
    filler_count: int
    filler_breakdown: dict[str, int] = field(default_factory=dict)
    practice_goals: tuple[str, ...] = ()
    """세션 시작 이벤트가 실어 준 '고치고 싶은 점' 코드. 비어 있으면 개인화 없음."""


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
    practice_goals: dict[str, tuple[str, ...]] | None = None,
) -> ReportInput:
    """SessionState를 얼려서 스냅샷으로 만든다.

    session_duration_ms를 안 주면 마지막 발화 종료 시각으로 대신한다
    (BE가 actualStartAt~endedAt을 주면 그 값을 쓰는 편이 정확하다).

    practice_goals는 userId → 설문 코드. SessionState에 없는 값이라 호출자가 넣는다.
    """
    goals = practice_goals or {}
    speaker_ids = tuple(
        dict.fromkeys((*state.participant_user_ids, *state.speakers))
    )
    speakers = tuple(
        SpeakerInput(
            speaker_id=speaker_id,
            utterances=(
                tuple(state.speakers[speaker_id].utterances)
                if speaker_id in state.speakers
                else ()
            ),
            speaking_ms=(
                state.speakers[speaker_id].speaking_ms
                if speaker_id in state.speakers
                else 0
            ),
            question_count=(
                state.speakers[speaker_id].question_count
                if speaker_id in state.speakers
                else 0
            ),
            filler_count=(
                state.speakers[speaker_id].filler_count
                if speaker_id in state.speakers
                else 0
            ),
            filler_breakdown=(
                dict(state.speakers[speaker_id].filler_breakdown)
                if speaker_id in state.speakers
                else {}
            ),
            practice_goals=goals.get(speaker_id, ()),
        )
        for speaker_id in speaker_ids
    )
    vision = tuple(
        VisionInput(
            user_id=user.user_id,
            available=user.vision_available,
            behavior_counts=dict(user.behavior_event_counts),
            coverage=_coverage_with_diagnosis(user),
            observation_window_ms=user.observation_window_ms,
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


def _coverage_with_diagnosis(user: VisionUserState) -> float | None:
    """커버리지를 구하고, 낮으면 사유를 남긴다."""
    coverage = _vision_coverage(user)
    if coverage is not None:
        _log_low_coverage(user.user_id, user, coverage)
    return coverage


def _log_low_coverage(user_id: str, user: VisionUserState, coverage: float) -> None:
    """커버리지가 낮으면 **왜** 낮은지 남긴다.

    실측 세션 17 에서 같은 세션인데 한 명은 0.93, 다른 한 명은 0.15 였다. 그 사람의
    비전 지표가 전부 null 이 됐는데, 카메라 위치·조명 문제인지 우리 임계가 빡빡한
    건지 판단할 근거가 없었다. 사유는 이미 페이로드에 실려 온다.

    상위 3개만 찍는다 — 한 스냅샷이 사유를 여러 개 달 수 있어 전부 찍으면 길다.
    """
    if coverage >= _LOW_COVERAGE or not user.unusable_reason_counts:
        return
    top = sorted(
        user.unusable_reason_counts.items(), key=lambda item: -item[1]
    )[:3]
    logger.warning(
        "vision coverage low user=%s coverage=%.2f snapshots=%d/%d reasons=%s",
        user_id,
        coverage,
        user.usable_snapshot_count,
        user.metric_snapshot_count,
        ", ".join(f"{name}={count}" for name, count in top),
    )


def _vision_coverage(user: VisionUserState) -> float | None:
    """Return the usable share of the browser's Vision observation window."""
    if user.observation_window_ms > 0:
        return min(
            1.0,
            max(0.0, user.usable_observed_ms / user.observation_window_ms),
        )
    if user.metric_snapshot_count > 0:
        return min(
            1.0,
            max(
                0.0,
                user.usable_snapshot_count / user.metric_snapshot_count,
            ),
        )
    return None
