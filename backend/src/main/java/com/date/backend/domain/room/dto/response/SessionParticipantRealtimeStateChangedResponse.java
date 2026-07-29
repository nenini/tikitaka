package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.SessionNetworkQuality;

import java.time.LocalDateTime;

public record SessionParticipantRealtimeStateChangedResponse(
		String eventType,
		Long sessionId,
		Long userId,
		boolean cameraEnabled,
		boolean microphoneEnabled,
		SessionNetworkQuality networkQuality,
		LocalDateTime mediaStateUpdatedAt,
		LocalDateTime networkQualityUpdatedAt,
		LocalDateTime occurredAt
) {
}
