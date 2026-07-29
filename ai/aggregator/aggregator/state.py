"""세션 상태 — 두 화자 타임라인을 공통 시간축(sessionElapsedMs)으로 누적.

통제실 설계 §3의 SessionState. 감지기·지표 집계가 이 상태를 읽는다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from aggregator.vision_events import VisionBehaviorEvent, VisionMetricSnapshot

_VISION_EPISODE_START_TYPES = {
    "FACE_MISSING_STARTED",
    "LOW_LIGHT_STARTED",
    "FACE_TOO_SMALL_STARTED",
    "ANALYSIS_UNAVAILABLE",
    "GAZE_AWAY_STARTED",
    "SMILE_STARTED",
}
_VISION_EPISODE_END_TYPES = {
    "FACE_MISSING_ENDED",
    "LOW_LIGHT_ENDED",
    "FACE_TOO_SMALL_ENDED",
    "ANALYSIS_RECOVERED",
    "GAZE_AWAY_ENDED",
    "SMILE_ENDED",
}


@dataclass
class Utterance:
    speaker_id: str
    start_ms: int
    end_ms: int
    text: str

    @property
    def duration_ms(self) -> int:
        return max(0, self.end_ms - self.start_ms)


@dataclass
class SpeakerState:
    speaker_id: str
    utterances: list[Utterance] = field(default_factory=list)
    speaking_ms: int = 0
    question_count: int = 0
    filler_count: int = 0

    @property
    def last_end_ms(self) -> int:
        return self.utterances[-1].end_ms if self.utterances else 0


@dataclass
class VisionUserState:
    """Latest useful Vision state; raw frames and unbounded history are forbidden."""

    user_id: str
    latest_metric: VisionMetricSnapshot | None = None
    latest_behavior: VisionBehaviorEvent | None = None
    active_episodes: dict[UUID, VisionBehaviorEvent] = field(default_factory=dict)
    behavior_event_counts: dict[str, int] = field(default_factory=dict)
    vision_available: bool = False
    low_smile_observed_ms: float = 0.0
    low_smile_episode: int = 0

    def apply_behavior(self, event: VisionBehaviorEvent) -> None:
        self.latest_behavior = event
        self.behavior_event_counts[event.event_type] = (
            self.behavior_event_counts.get(event.event_type, 0) + 1
        )
        if event.event_type == "ANALYSIS_UNAVAILABLE":
            self.vision_available = False
        elif event.event_type == "ANALYSIS_RECOVERED":
            self.vision_available = True
        elif event.event_type == "SMILE_STARTED":
            self.low_smile_observed_ms = 0
            self.low_smile_episode += 1
        if event.episode_id is None:
            return
        if event.event_type in _VISION_EPISODE_START_TYPES:
            self.active_episodes[event.episode_id] = event
        elif event.event_type in _VISION_EPISODE_END_TYPES:
            self.active_episodes.pop(event.episode_id, None)


@dataclass
class UserRuntimeState:
    """Shared user slot that STT v2 can fill without changing Vision code."""

    user_id: str
    vision: VisionUserState
    is_speaking: bool = False
    current_utterance_id: UUID | None = None
    speech_started_at_ms: int | None = None
    last_speech_started_at_ms: int | None = None
    last_speech_ended_at_ms: int | None = None
    last_question_ended_at_ms: int | None = None
    last_question_trigger_id: str | None = None
    last_verbal_reaction_at_ms: int | None = None


@dataclass
class SessionState:
    session_id: str
    speakers: dict[str, SpeakerState] = field(default_factory=dict)
    vision_users: dict[str, VisionUserState] = field(default_factory=dict)
    users: dict[str, UserRuntimeState] = field(default_factory=dict)
    participant_user_ids: list[str] = field(default_factory=list)
    session_active: bool = True
    last_activity_ms: int = 0              # 마지막으로 누군가 발화를 끝낸 시각

    def speaker(self, speaker_id: str) -> SpeakerState:
        state = self.speakers.get(speaker_id)
        if state is None:
            state = SpeakerState(speaker_id)
            self.speakers[speaker_id] = state
        return state

    def add_utterance(self, utterance: Utterance) -> None:
        state = self.speaker(utterance.speaker_id)
        state.utterances.append(utterance)
        state.speaking_ms += utterance.duration_ms
        self.last_activity_ms = max(self.last_activity_ms, utterance.end_ms)

    def vision_user(self, user_id: str) -> VisionUserState:
        return self.user(user_id).vision

    def user(self, user_id: str) -> UserRuntimeState:
        if user_id not in self.participant_user_ids:
            self.participant_user_ids.append(user_id)
        state = self.users.get(user_id)
        if state is None:
            vision = self.vision_users.get(user_id)
            if vision is None:
                vision = VisionUserState(user_id)
                self.vision_users[user_id] = vision
            state = UserRuntimeState(user_id=user_id, vision=vision)
            self.users[user_id] = state
        return state

    def register_participants(self, user_ids: list[str]) -> None:
        for user_id in user_ids:
            self.user(user_id)

    def apply_vision_behavior(self, event: VisionBehaviorEvent) -> None:
        self.vision_user(event.user_id).apply_behavior(event)

    def apply_vision_metric(self, event: VisionMetricSnapshot) -> None:
        vision = self.vision_user(event.user_id)
        vision.latest_metric = event
        vision.vision_available = event.payload.quality.usable

    def speaking_ratio(self, speaker_id: str) -> float | None:
        """화자 발화시간 / 두 화자 발화시간 합. 1명뿐이면 None(비율 무의미)."""
        total = sum(state.speaking_ms for state in self.speakers.values())
        if total == 0 or len(self.speakers) < 2:
            return None
        return round(self.speaker(speaker_id).speaking_ms / total, 2)
