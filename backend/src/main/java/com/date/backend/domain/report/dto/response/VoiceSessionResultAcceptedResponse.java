package com.date.backend.domain.report.dto.response;

public record VoiceSessionResultAcceptedResponse(
		Long id,
		Long sessionId,
		Long userId,
		String version,
		boolean duplicate
) {}
