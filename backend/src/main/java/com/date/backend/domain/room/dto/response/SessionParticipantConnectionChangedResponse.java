package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.SessionConnectionStatus;
import com.date.backend.domain.room.domain.SessionNetworkQuality;

import java.time.LocalDateTime;

public record SessionParticipantConnectionChangedResponse(
		String eventType,
		Long sessionId,
		Long userId,
		SessionConnectionStatus connectionStatus,
		LocalDateTime connectedAt,
		LocalDateTime disconnectedAt,
		LocalDateTime reconnectingAt,
		LocalDateTime reconnectDeadlineAt,
		LocalDateTime reconnectedAt,
		int reconnectAttemptCount,
		boolean cameraEnabled,
		boolean microphoneEnabled,
		SessionNetworkQuality networkQuality,
		LocalDateTime mediaStateUpdatedAt,
		LocalDateTime networkQualityUpdatedAt,
		LocalDateTime occurredAt
) {
}
