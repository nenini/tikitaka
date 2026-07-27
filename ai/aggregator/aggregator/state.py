"""세션 상태 — 두 화자 타임라인을 공통 시간축(sessionElapsedMs)으로 누적.

통제실 설계 §3의 SessionState. 감지기·지표 집계가 이 상태를 읽는다.
"""

from __future__ import annotations

from dataclasses import dataclass, field


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
class SessionState:
    session_id: str
    speakers: dict[str, SpeakerState] = field(default_factory=dict)
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

    def speaking_ratio(self, speaker_id: str) -> float | None:
        """화자 발화시간 / 두 화자 발화시간 합. 1명뿐이면 None(비율 무의미)."""
        total = sum(state.speaking_ms for state in self.speakers.values())
        if total == 0 or len(self.speakers) < 2:
            return None
        return round(self.speaker(speaker_id).speaking_ms / total, 2)
