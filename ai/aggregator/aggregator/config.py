"""Configuration for the rule-based control-room MVP."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MvpCoachingConfig:
    """All tunable MVP thresholds in one place."""

    coaching_ttl_ms: int = 15_000
    default_cooldown_ms: int = 60_000
    vision_setup_cooldown_ms: int = 120_000
    vision_setup_startup_grace_ms: int = 3_000
    max_per_session: int = 50
    max_per_user: int = 25

    response_prompt_delay_ms: int = 5_000
    reaction_prompt_delay_ms: int = 15_000
    low_smile_observed_ms: int = 20_000
    low_smile_cooldown_ms: int = 90_000
    low_smile_max_per_user: int = 2
    low_smile_score_threshold: float = 0.15
    low_smile_min_confidence: float = 0.65
    attention_min_confidence: float = 0.75
    face_missing_guidance_ms: int = 5_000
    face_too_small_guidance_ms: int = 3_000
    low_light_guidance_ms: int = 10_000

    voice_quiet_dbfs: float = -42.0
    """이보다 조용한 발화가 이어지면 "조금 크게" 안내. float32 [-1,1] 기준이다.

    보수적으로 잡았다. 실측 기준 보통 발화가 -22, 또렷하게 작은 목소리가 -44 정도라
    -42 는 "마이크가 멀거나 정말 작게 말하는" 구간만 잡는다. 마이크 게인·거리·OS AGC 로
    절대값이 흔들리므로 한 발화로 판정하지 않고 연속 발화를 요구한다.
    """
    voice_loud_dbfs: float = -9.0
    """이보다 큰 발화가 이어지면 "낮춰 보세요" 안내. 클리핑 직전 구간이다."""
    voice_sample_utterances: int = 3
    """판정에 필요한 연속 발화 수. 한 번 웅얼거린 걸로 코칭하면 안 된다."""
    voice_min_utterance_ms: int = 700
    """이보다 짧은 발화는 음량 판정에서 뺀다 — 추임새("네")는 원래 작다."""
    voice_cooldown_ms: int = 120_000
    voice_max_per_user: int = 2

    def __post_init__(self) -> None:
        duration_values = (
            self.coaching_ttl_ms,
            self.default_cooldown_ms,
            self.vision_setup_cooldown_ms,
            self.vision_setup_startup_grace_ms,
            self.response_prompt_delay_ms,
            self.reaction_prompt_delay_ms,
            self.low_smile_observed_ms,
            self.low_smile_cooldown_ms,
            self.face_missing_guidance_ms,
            self.face_too_small_guidance_ms,
            self.low_light_guidance_ms,
            self.voice_cooldown_ms,
        )
        if any(value < 0 for value in duration_values):
            raise ValueError("MVP coaching durations must be non-negative")
        if self.coaching_ttl_ms == 0:
            raise ValueError("coaching_ttl_ms must be positive")
        if self.max_per_session <= 0 or self.max_per_user <= 0:
            raise ValueError("coaching limits must be positive")
        if self.low_smile_max_per_user <= 0:
            raise ValueError("low_smile_max_per_user must be positive")
        if not 0 <= self.attention_min_confidence <= 1:
            raise ValueError("attention_min_confidence must be between 0 and 1")
        if not 0 <= self.low_smile_score_threshold <= 1:
            raise ValueError("low_smile_score_threshold must be between 0 and 1")
        if not 0 <= self.low_smile_min_confidence <= 1:
            raise ValueError("low_smile_min_confidence must be between 0 and 1")

    def cooldown_for(self, coaching_type: str) -> int:
        if coaching_type == "VISION_SETUP_GUIDANCE":
            return self.vision_setup_cooldown_ms
        if coaching_type == "EXPRESSION_GUIDANCE":
            return self.low_smile_cooldown_ms
        if coaching_type == "VOLUME_GUIDANCE":
            return self.voice_cooldown_ms
        return self.default_cooldown_ms

    def max_per_type_for(self, coaching_type: str) -> int | None:
        """타입별 세션 상한. None 이면 타입 상한 없이 max_per_user 만 본다.

        같은 잔소리를 반복하면 안 되는 축이 있다 — 표정과 성량이 그렇다. 사용자가
        고치기 어려운 것을 매번 지적하면 코칭이 아니라 압박이 된다.
        """
        if coaching_type == "EXPRESSION_GUIDANCE":
            return self.low_smile_max_per_user
        if coaching_type == "VOLUME_GUIDANCE":
            return self.voice_max_per_user
        return None
