"""실측 음량(dBFS) 기반 성량 코칭.

설문에는 예전부터 "목소리가 너무 커요/작아요"가 있었고(BE `practice_goal_catalog`)
미션까지 시딩돼 있었는데, **재는 코드가 없어서** 리포트도 코칭도 이 축을 통째로 비워
뒀다. STT 가 발화 구간의 RMS 를 실어 보내면서(`SpeechEndedPayload.rmsDbfs`) 판정이
가능해졌다.

절대 dBFS 는 마이크 게인·거리·OS AGC 에 따라 흔들린다. 그래서
  - 임계를 보수적으로 잡고(정말 안 들리는 구간만),
  - 한 발화로 판정하지 않고 연속 N개를 요구하고,
  - 짧은 추임새는 표본에서 뺀다("네"는 원래 작다).
"""

from __future__ import annotations

from aggregator.coaching_candidates import CoachingCandidate
from aggregator.config import MvpCoachingConfig
from aggregator.state import SessionState


class VolumeCoachingDetector:
    """연속된 발화가 한 방향으로 치우쳤을 때만 성량을 안내한다."""

    def __init__(self, config: MvpCoachingConfig) -> None:
        self.config = config

    def on_speech_ended(
        self,
        state: SessionState,
        user_id: str,
        *,
        rms_dbfs: float | None,
        speech_duration_ms: int,
    ) -> None:
        """발화 하나의 음량을 표본에 넣는다. 판정은 on_tick 이 한다."""
        if rms_dbfs is None:
            return  # 음량을 안 실어 보내는 생산자(파일 재생 등)
        if speech_duration_ms < self.config.voice_min_utterance_ms:
            return
        samples = state.user(user_id).recent_utterance_dbfs
        samples.append(rms_dbfs)
        # 표본은 판정에 필요한 만큼만 남긴다. 세션 내내 쌓으면 초반 음량이 계속 발목을 잡는다.
        del samples[: -self.config.voice_sample_utterances]

    def on_tick(
        self,
        state: SessionState,
        now_ms: int,
    ) -> list[CoachingCandidate]:
        candidates: list[CoachingCandidate] = []
        needed = self.config.voice_sample_utterances
        for user in state.users.values():
            samples = user.recent_utterance_dbfs
            if len(samples) < needed:
                continue
            if all(value <= self.config.voice_quiet_dbfs for value in samples):
                direction, message = "UP", "VOLUME_GUIDANCE_UP_01"
            elif all(value >= self.config.voice_loud_dbfs for value in samples):
                direction, message = "DOWN", "VOLUME_GUIDANCE_DOWN_01"
            else:
                continue
            candidates.append(
                CoachingCandidate(
                    coaching_type="VOLUME_GUIDANCE",
                    target_user_id=user.user_id,
                    message_key=message,
                    reason_code=f"VOICE_TOO_{'QUIET' if direction == 'UP' else 'LOUD'}",
                    triggered_at_ms=now_ms,
                    # 표본이 한 칸이라도 밀리면 다른 구간이다. 같은 표본으로 두 번
                    # 나가는 건 정책이 trigger_id 로 막는다.
                    trigger_id=(
                        f"volume:{direction}:{user.user_id}:"
                        f"{round(sum(samples) / len(samples))}"
                    ),
                    priority="MEDIUM",
                )
            )
        return candidates


__all__ = ["VolumeCoachingDetector"]
