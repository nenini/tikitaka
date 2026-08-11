"""Rule detectors that turn validated inputs into coaching candidates."""

from aggregator.coaching_detectors.attention import AttentionCoachingDetector
from aggregator.coaching_detectors.conversation import (
    ConversationCoachingDetector,
)
from aggregator.coaching_detectors.vision_setup import VisionSetupCoachingDetector
from aggregator.coaching_detectors.smile import SmileCoachingDetector
from aggregator.coaching_detectors.volume import VolumeCoachingDetector

__all__ = [
    "AttentionCoachingDetector",
    "ConversationCoachingDetector",
    "VisionSetupCoachingDetector",
    "SmileCoachingDetector",
    "VolumeCoachingDetector",
]
