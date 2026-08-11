"""Low-priority expression guidance based on valid Vision v4 observation."""

from __future__ import annotations

from aggregator.coaching_candidates import CoachingCandidate
from aggregator.config import MvpCoachingConfig
from aggregator.state import SessionState
from aggregator.vision_events import VisionMetricSnapshot


class SmileCoachingDetector:
    """Accumulate only observable, listening-time low-smile intervals."""

    def __init__(self, config: MvpCoachingConfig) -> None:
        self.config = config

    def on_metric(
        self,
        state: SessionState,
        event: VisionMetricSnapshot,
    ) -> None:
        target = state.user(event.user_id)
        vision = target.vision
        hand_over_mouth = event.payload.metrics.hand_over_mouth
        if hand_over_mouth.active:
            vision.low_smile_observed_ms = 0.0
            if not vision.hand_over_mouth_active:
                vision.low_smile_episode += 1
            vision.hand_over_mouth_active = True
            return
        vision.hand_over_mouth_active = False

        smile = event.payload.metrics.smile
        configuration_score = smile.configuration_score
        active_detectors = event.payload.capabilities.active_detectors

        eligible = (
            event.payload.quality.usable
            and "SMILE_EXPRESSION" in active_detectors
            and configuration_score is not None
            and smile.confidence >= self.config.low_smile_min_confidence
            and not smile.prompt_suppressed_by_baseline
            and not target.is_speaking
            and self._one_other_user_is_speaking(state, target.user_id)
        )
        if not eligible:
            return

        if configuration_score is None:
            return
        if configuration_score >= self.config.low_smile_score_threshold:
            vision.low_smile_observed_ms = 0.0
            vision.low_smile_episode += 1
            return

        vision.low_smile_observed_ms += (
            event.payload.observation_interval.observed_duration_ms
        )

    def on_tick(
        self,
        state: SessionState,
        now_ms: int,
    ) -> list[CoachingCandidate]:
        candidates: list[CoachingCandidate] = []
        for target in state.users.values():
            if target.is_speaking:
                continue
            if not self._one_other_user_is_speaking(state, target.user_id):
                continue
            if (
                target.vision.low_smile_observed_ms
                < self.config.low_smile_observed_ms
            ):
                continue
            cooldown_bucket = now_ms // max(1, self.config.low_smile_cooldown_ms)
            candidates.append(
                CoachingCandidate(
                    coaching_type="EXPRESSION_GUIDANCE",
                    target_user_id=target.user_id,
                    message_key="EXPRESSION_GUIDANCE_01",
                    reason_code="LOW_SMILE_WHILE_LISTENING",
                    triggered_at_ms=now_ms,
                    trigger_id=(
                        f"low-smile:{target.user_id}:"
                        f"{target.vision.low_smile_episode}:{cooldown_bucket}"
                    ),
                    priority="LOW",
                )
            )
        return candidates

    @staticmethod
    def _one_other_user_is_speaking(
        state: SessionState,
        target_user_id: str,
    ) -> bool:
        speakers = [
            user
            for user in state.users.values()
            if user.user_id != target_user_id and user.is_speaking
        ]
        return len(speakers) == 1
