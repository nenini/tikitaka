package com.date.backend.domain.room.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Objects;

@ConfigurationProperties(prefix = "session.timer")
public record SessionTimerProperties(
		boolean enabled,
		long fixedDelayMs,
		long initialDelayMs,
		int batchSize,
		Duration endingSoonBefore,
		Duration endingImminentBefore
) {
	public SessionTimerProperties {
		if (fixedDelayMs <= 0) {
			throw new IllegalArgumentException(
					"session.timer.fixed-delay-ms는 양수여야 합니다."
			);
		}
		if (initialDelayMs < 0) {
			throw new IllegalArgumentException(
					"session.timer.initial-delay-ms는 0 이상이어야 합니다."
			);
		}
		if (batchSize <= 0) {
			throw new IllegalArgumentException(
					"session.timer.batch-size는 양수여야 합니다."
			);
		}
		Objects.requireNonNull(
				endingSoonBefore,
				"session.timer.ending-soon-before가 필요합니다."
		);
		Objects.requireNonNull(
				endingImminentBefore,
				"session.timer.ending-imminent-before가 필요합니다."
		);
		if (endingSoonBefore.isZero() || endingSoonBefore.isNegative()) {
			throw new IllegalArgumentException(
					"session.timer.ending-soon-before는 양수여야 합니다."
			);
		}
		if (endingImminentBefore.isZero()
				|| endingImminentBefore.isNegative()) {
			throw new IllegalArgumentException(
					"session.timer.ending-imminent-before는 양수여야 합니다."
			);
		}
		if (endingSoonBefore.compareTo(endingImminentBefore) <= 0) {
			throw new IllegalArgumentException(
					"종료 임박 알림 시간은 최종 알림 시간보다 길어야 합니다."
			);
		}
	}
}
