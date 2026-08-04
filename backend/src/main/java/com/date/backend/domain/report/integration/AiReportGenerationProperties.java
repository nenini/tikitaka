package com.date.backend.domain.report.integration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.time.Duration;

@ConfigurationProperties(prefix = "ai.report")
public record AiReportGenerationProperties(
		String baseUrl, String generationPath, Duration connectTimeout,
		Duration requestTimeout, int maxAttempts, Duration retryDelay,
		Duration generationTimeout, int timeoutBatchSize
) {
	public AiReportGenerationProperties {
		baseUrl = normalizeBase(baseUrl);
		generationPath = normalizePath(generationPath);
		connectTimeout = positive(connectTimeout, Duration.ofSeconds(3));
		requestTimeout = positive(requestTimeout, Duration.ofSeconds(10));
		maxAttempts = maxAttempts <= 0 ? 3 : maxAttempts;
		retryDelay = positive(retryDelay, Duration.ofSeconds(2));
		generationTimeout = positive(generationTimeout, Duration.ofMinutes(5));
		timeoutBatchSize = timeoutBatchSize <= 0 ? 100 : timeoutBatchSize;
	}
	public boolean configured() { return !baseUrl.isBlank(); }
	public String generationUrl() { return baseUrl + generationPath; }
	private static String normalizeBase(String value) {
		return value == null || value.isBlank() ? "" : value.trim().replaceFirst("/+$", "");
	}
	private static String normalizePath(String value) {
		if (value == null || value.isBlank()) return "/internal/v1/session-reports/generate";
		String trimmed = value.trim(); return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
	}
	private static Duration positive(Duration value, Duration fallback) {
		return value == null || value.isZero() || value.isNegative() ? fallback : value;
	}
}
