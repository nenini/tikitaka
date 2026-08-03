package com.date.backend.domain.result.event;

import java.time.LocalDateTime;

public record PeerEvaluationsCompletedEvent(
		Long sessionId,
		LocalDateTime completedAt
) {
}
