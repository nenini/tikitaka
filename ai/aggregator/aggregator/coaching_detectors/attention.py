"""Conservative attention coaching based on Vision plus speaking state."""

from __future__ import annotations

from aggregator.coaching_candidates import CoachingCandidate
from aggregator.config import MvpCoachingConfig
from aggregator.state import SessionState
from aggregator.vision_events import (
    DetectorName,
    ProlongedGazeAway,
    VisionBehaviorEvent,
)

_ATTENTION_BLOCKING_EPISODES = {
    "FACE_MISSING_STARTED",
    "FACE_TOO_SMALL_STARTED",
    "LOW_LIGHT_STARTED",
    "ANALYSIS_UNAVAILABLE",
}


class AttentionCoachingDetector:
    def __init__(self, config: MvpCoachingConfig) -> None:
        self.config = config

    def on_vision_event(
        self,
        state: SessionState,
        event: VisionBehaviorEvent,
    ) -> list[CoachingCandidate]:
        if not isinstance(event, ProlongedGazeAway):
            return []
        if not event.coaching_eligible:
            return []
        if event.confidence < self.config.attention_min_confidence:
            return []

        target = state.user(event.user_id)
        metric = target.vision.latest_metric
        if metric is None or not metric.payload.quality.usable:
            return []
        if (
            DetectorName.SCREEN_ATTENTION
            not in metric.payload.capabilities.active_detectors
        ):
            return []
        if any(
            episode.event_type in _ATTENTION_BLOCKING_EPISODES
            for episode in target.vision.active_episodes.values()
        ):
            return []
        if target.is_speaking:
            return []

        speaking_partners = [
            user
            for user in state.users.values()
            if user.user_id != event.user_id and user.is_speaking
        ]
        if len(speaking_partners) != 1:
            # Until STT v2 fills speaking state, attention coaching stays off.
            return []

        trigger_id = str(event.episode_id or event.event_id)
        return [
            CoachingCandidate(
                coaching_type="ATTENTION_RECOVERY",
                target_user_id=event.user_id,
                message_key="ATTENTION_RECOVERY_01",
                reason_code="PROLONGED_GAZE_AWAY_WHILE_LISTENING",
                triggered_at_ms=int(event.session_elapsed_ms),
                trigger_id=trigger_id,
                priority="MEDIUM",
            )
        ]
