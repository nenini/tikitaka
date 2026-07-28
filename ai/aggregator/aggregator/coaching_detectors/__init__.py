"""Rule detectors that turn validated inputs into coaching candidates."""

from aggregator.coaching_detectors.attention import AttentionCoachingDetector
from aggregator.coaching_detectors.vision_setup import VisionSetupCoachingDetector

__all__ = ["AttentionCoachingDetector", "VisionSetupCoachingDetector"]

