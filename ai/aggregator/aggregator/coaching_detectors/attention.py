"""Conservative attention coaching based on Vision plus speaking state."""

from __future__ import annotations

import logging

from aggregator.coaching_candidates import CoachingCandidate
from aggregator.config import MvpCoachingConfig
from aggregator.state import SessionState, UserRuntimeState
from aggregator.vision_events import (
    DetectorName,
    ProlongedGazeAway,
    VisionBehaviorEvent,
)

logger = logging.getLogger(__name__)

_ATTENTION_BLOCKING_EPISODES = {
    "FACE_MISSING_STARTED",
    "FACE_TOO_SMALL_STARTED",
    "LOW_LIGHT_STARTED",
    "ANALYSIS_UNAVAILABLE",
}

# Vision packets are buffered in the browser publisher (batchIntervalMs 500)
# and STT rides a different transport, so the two elapsed clocks drift by
# roughly a second. Widen the overlap window rather than lose a real listening
# episode to that skew.
_SPEECH_OVERLAP_TOLERANCE_MS = 1_500


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

        # Every gate below used to return silently, so a session that produced
        # zero attention coaching gave no clue which rule rejected it. Two
        # production sessions were spent guessing. Name the gate instead.
        if not event.coaching_eligible:
            return self._blocked("NOT_COACHING_ELIGIBLE", event)

        # Judge on measurement quality, not on the mode-capped attention
        # confidence. A head departure loses binocular agreement, which forces
        # the producer into HEAD_CENTER_ONLY, whose confidence cap (0.65) sits
        # below this threshold (0.75) by construction — scoring the event on
        # that axis rejects every head turn no matter how clean the frame was.
        # Mirrors coachingEligibleFor() in ScreenAttentionDetector.ts.
        evidence = (
            event.measurement_confidence
            if event.measurement_confidence is not None
            else event.confidence
        )
        if evidence < self.config.attention_min_confidence:
            return self._blocked(
                "CONFIDENCE_TOO_LOW",
                event,
                evidence=evidence,
                threshold=self.config.attention_min_confidence,
            )

        target = state.user(event.user_id)
        metric = target.vision.latest_metric
        if metric is None:
            return self._blocked("NO_VISION_METRIC", event)
        if not metric.payload.quality.usable:
            return self._blocked("METRIC_NOT_USABLE", event)
        if (
            DetectorName.SCREEN_ATTENTION
            not in metric.payload.capabilities.active_detectors
        ):
            return self._blocked("SCREEN_ATTENTION_INACTIVE", event)
        blocking = [
            episode.event_type
            for episode in target.vision.active_episodes.values()
            if episode.event_type in _ATTENTION_BLOCKING_EPISODES
        ]
        if blocking:
            return self._blocked("BLOCKING_EPISODE", event, episodes=blocking)
        if target.is_speaking:
            return self._blocked("TARGET_IS_SPEAKING", event)

        # A prolonged gaze-away describes a window, not an instant. Reading
        # live is_speaking at ingestion asks whether the partner happens to be
        # mid-utterance right now, several seconds after the gaze-away began
        # and after the packet spent its batch interval in the browser. Speech
        # is bursty, so that check missed nearly every real listening episode.
        # Ask whether the partner spoke *during* the episode instead.
        window_start_ms = (
            event.session_elapsed_ms
            - event.payload.active_duration_ms
            - _SPEECH_OVERLAP_TOLERANCE_MS
        )
        speaking_partners = [
            user
            for user in state.users.values()
            if user.user_id != event.user_id
            and _spoke_during(user, window_start_ms)
        ]
        if not speaking_partners:
            return self._blocked(
                "NO_SPEAKING_PARTNER",
                event,
                window_start_ms=int(window_start_ms),
            )

        trigger_id = str(event.episode_id or event.event_id)
        logger.info(
            "attention coaching admitted session=%s user=%s episode=%s",
            event.session_id,
            event.user_id,
            trigger_id,
        )
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

    @staticmethod
    def _blocked(
        reason: str,
        event: ProlongedGazeAway,
        **details: object,
    ) -> list[CoachingCandidate]:
        logger.info(
            "attention coaching blocked reason=%s session=%s user=%s "
            "episode=%s confidence=%s%s",
            reason,
            event.session_id,
            event.user_id,
            event.episode_id,
            event.confidence,
            "".join(f" {key}={value}" for key, value in details.items()),
        )
        return []


def _spoke_during(user: UserRuntimeState, window_start_ms: float) -> bool:
    """Return whether ``user`` held the floor at any point after the window opened."""
    if user.is_speaking:
        return True
    ended_at = user.last_speech_ended_at_ms
    return ended_at is not None and ended_at >= window_start_ms
