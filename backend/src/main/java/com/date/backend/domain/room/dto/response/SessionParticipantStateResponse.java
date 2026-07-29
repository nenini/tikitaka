package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.SessionConnectionStatus;
import com.date.backend.domain.room.domain.SessionNetworkQuality;

import java.time.LocalDateTime;

public record SessionParticipantStateResponse(
		Long userId,
		boolean joined,
		boolean ready,
		LocalDateTime joinedAt,
		SessionConnectionStatus connectionStatus,
		LocalDateTime connectedAt,
		LocalDateTime disconnectedAt,
		LocalDateTime lastHeartbeatAt,
		LocalDateTime reconnectingAt,
		LocalDateTime reconnectDeadlineAt,
		LocalDateTime reconnectedAt,
		LocalDateTime recoveryFailedAt,
		int reconnectAttemptCount,
		boolean cameraEnabled,
		boolean microphoneEnabled,
		SessionNetworkQuality networkQuality,
		LocalDateTime mediaStateUpdatedAt,
		LocalDateTime networkQualityUpdatedAt
) {
}
