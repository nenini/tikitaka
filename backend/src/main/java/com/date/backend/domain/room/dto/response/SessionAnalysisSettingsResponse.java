package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.RoomParticipant;

public record SessionAnalysisSettingsResponse(
		Long sessionId,
		Long userId,
		boolean voiceAnalysisEnabled,
		boolean expressionAnalysisEnabled
) {
	public static SessionAnalysisSettingsResponse from(
			Long sessionId,
			RoomParticipant participant
	) {
		return new SessionAnalysisSettingsResponse(
				sessionId,
				participant.getUserId(),
				participant.isVoiceAnalysisEnabled(),
				participant.isExpressionAnalysisEnabled()
		);
	}
}
