package com.date.backend.domain.room.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "session.realtime")
public record SessionRealtimeProperties(
		Duration heartbeatTimeout,
		Duration reconnectGracePeriod,
		boolean monitorEnabled,
		long monitorFixedDelayMs,
		long monitorInitialDelayMs,
		int monitorBatchSize
) {
	public SessionRealtimeProperties {
		heartbeatTimeout = positiveOrDefault(
				heartbeatTimeout,
				Duration.ofSeconds(15)
		);
		reconnectGracePeriod = positiveOrDefault(
				reconnectGracePeriod,
				Duration.ofSeconds(20)
		);
		monitorFixedDelayMs =
				monitorFixedDelayMs > 0 ? monitorFixedDelayMs : 5_000;
		monitorInitialDelayMs =
				monitorInitialDelayMs >= 0 ? monitorInitialDelayMs : 5_000;
		monitorBatchSize = monitorBatchSize > 0 ? monitorBatchSize : 100;
	}

	private static Duration positiveOrDefault(
			Duration value,
			Duration defaultValue
	) {
		return value == null || value.isZero() || value.isNegative()
				? defaultValue
				: value;
	}
}
