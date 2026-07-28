"""Configuration for the rule-based control-room MVP."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MvpCoachingConfig:
    """All tunable MVP thresholds in one place."""

    coaching_ttl_ms: int = 5_000
    default_cooldown_ms: int = 60_000
    vision_setup_cooldown_ms: int = 120_000
    max_per_session: int = 20
    max_per_user: int = 10

    attention_min_confidence: float = 0.75
    face_missing_guidance_ms: int = 5_000
    face_too_small_guidance_ms: int = 5_000
    low_light_guidance_ms: int = 10_000

    def __post_init__(self) -> None:
        duration_values = (
            self.coaching_ttl_ms,
            self.default_cooldown_ms,
            self.vision_setup_cooldown_ms,
            self.face_missing_guidance_ms,
            self.face_too_small_guidance_ms,
            self.low_light_guidance_ms,
        )
        if any(value < 0 for value in duration_values):
            raise ValueError("MVP coaching durations must be non-negative")
        if self.coaching_ttl_ms == 0:
            raise ValueError("coaching_ttl_ms must be positive")
        if self.max_per_session <= 0 or self.max_per_user <= 0:
            raise ValueError("coaching limits must be positive")
        if not 0 <= self.attention_min_confidence <= 1:
            raise ValueError("attention_min_confidence must be between 0 and 1")

    def cooldown_for(self, coaching_type: str) -> int:
        if coaching_type == "VISION_SETUP_GUIDANCE":
            return self.vision_setup_cooldown_ms
        return self.default_cooldown_ms
