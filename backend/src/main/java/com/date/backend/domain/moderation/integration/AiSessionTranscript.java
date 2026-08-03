package com.date.backend.domain.moderation.integration;

import java.time.LocalDateTime;

public record AiSessionTranscript(
		Long sessionId,
		String transcript,
		LocalDateTime generatedAt
) {}
