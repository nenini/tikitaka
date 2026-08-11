package com.date.backend.domain.room.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "livekit")
public record LiveKitProperties(
		String url,
		String apiKey,
		String apiSecret,
		int emptyTimeoutSeconds,
		int maxParticipants
) {
	public LiveKitProperties {
		url = normalizeServerApiUrl(url);
		apiKey = apiKey == null ? "" : apiKey.trim();
		apiSecret = apiSecret == null ? "" : apiSecret.trim();
		emptyTimeoutSeconds = emptyTimeoutSeconds <= 0 ? 600 : emptyTimeoutSeconds;
		maxParticipants = maxParticipants <= 0 ? 3 : maxParticipants;
	}

	public boolean configured() {
		return !url.isBlank() && !apiKey.isBlank() && !apiSecret.isBlank();
	}

	public String clientUrl() {
		if (url.regionMatches(true, 0, "https://", 0, 8)) {
			return "wss://" + url.substring(8);
		}
		if (url.regionMatches(true, 0, "http://", 0, 7)) {
			return "ws://" + url.substring(7);
		}
		return url;
	}

	private static String normalizeServerApiUrl(String value) {
		if (value == null || value.isBlank()) {
			return "";
		}
		String normalized = value.trim();
		if (normalized.regionMatches(true, 0, "wss://", 0, 6)) {
			return "https://" + normalized.substring(6);
		}
		if (normalized.regionMatches(true, 0, "ws://", 0, 5)) {
			return "http://" + normalized.substring(5);
		}
		return normalized;
	}
}
