"""Camera and analysis setup guidance that depends only on Vision v4."""

from __future__ import annotations

from aggregator.coaching_candidates import CoachingCandidate
from aggregator.config import MvpCoachingConfig
from aggregator.state import SessionState
from aggregator.vision_events import (
    AnalysisUnavailable,
    FaceMissingStarted,
    FaceTooSmallStarted,
    LowLightStarted,
    VisionBehaviorEvent,
)

_TECHNICAL_UNAVAILABLE_REASONS = {
    "CAMERA_DISABLED",
    "TRACK_ENDED",
    "VIDEO_DIMENSIONS_UNAVAILABLE",
    "LANDMARKER_UNAVAILABLE",
    "WORKER_ERROR",
}


class VisionSetupCoachingDetector:
    def __init__(self, config: MvpCoachingConfig) -> None:
        self.config = config

    def on_vision_event(
        self,
        state: SessionState,
        event: VisionBehaviorEvent,
    ) -> list[CoachingCandidate]:
        if not isinstance(event, AnalysisUnavailable):
            return []
        # Quality problems have concrete, delayed instructions. The generic
        # camera message is reserved for actual camera/analysis failures.
        if not self._has_technical_failure(event):
            return []
        # Startup failures are often just the browser Worker warming up. The
        # active episode is evaluated by on_tick after the grace period.
        if event.session_elapsed_ms < self.config.vision_setup_startup_grace_ms:
            return []
        return [self._analysis_unavailable_candidate(event)]

    def on_tick(
        self,
        state: SessionState,
        now_ms: int,
    ) -> list[CoachingCandidate]:
        candidates: list[CoachingCandidate] = []
        for user in state.users.values():
            # Prefer a concrete fix (face, distance, light) over the generic
            # unavailable message when both episodes are active on one tick.
            episodes = sorted(
                user.vision.active_episodes.items(),
                key=lambda item: isinstance(item[1], AnalysisUnavailable),
            )
            for episode_id, event in episodes:
                if isinstance(event, AnalysisUnavailable):
                    if not self._has_technical_failure(event):
                        continue
                    threshold_ms = max(
                        self.config.vision_setup_startup_grace_ms,
                        int(event.payload.observed_start_elapsed_ms),
                    )
                    if now_ms < threshold_ms:
                        continue
                    candidates.append(self._analysis_unavailable_candidate(event))
                    continue
                if isinstance(event, FaceMissingStarted):
                    threshold_ms = self.config.face_missing_guidance_ms
                    message_key = "FACE_VISIBILITY_01"
                    reason_code = "FACE_NOT_VISIBLE"
                elif isinstance(event, FaceTooSmallStarted):
                    threshold_ms = self.config.face_too_small_guidance_ms
                    message_key = "FACE_DISTANCE_01"
                    reason_code = "FACE_TOO_SMALL"
                elif isinstance(event, LowLightStarted):
                    threshold_ms = self.config.low_light_guidance_ms
                    message_key = "LIGHTING_GUIDANCE_01"
                    reason_code = "LOW_LIGHT"
                else:
                    continue
                observed_start = event.payload.observed_start_elapsed_ms
                if now_ms - observed_start < threshold_ms:
                    continue
                candidates.append(
                    CoachingCandidate(
                        coaching_type="VISION_SETUP_GUIDANCE",
                        target_user_id=user.user_id,
                        message_key=message_key,
                        reason_code=reason_code,
                        triggered_at_ms=now_ms,
                        trigger_id=str(episode_id),
                        priority="HIGH",
                    )
                )
        return candidates

    @staticmethod
    def _has_technical_failure(event: AnalysisUnavailable) -> bool:
        return any(
            str(reason) in _TECHNICAL_UNAVAILABLE_REASONS
            for reason in event.payload.reasons
        )

    @staticmethod
    def _analysis_unavailable_candidate(
        event: AnalysisUnavailable,
    ) -> CoachingCandidate:
        return CoachingCandidate(
            coaching_type="VISION_SETUP_GUIDANCE",
            target_user_id=event.user_id,
            message_key="VISION_UNAVAILABLE_01",
            reason_code="VISION_ANALYSIS_UNAVAILABLE",
            triggered_at_ms=int(event.session_elapsed_ms),
            trigger_id=str(event.episode_id or event.event_id),
            priority="HIGH",
        )
