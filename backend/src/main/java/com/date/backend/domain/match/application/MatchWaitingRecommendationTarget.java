package com.date.backend.domain.match.application;

import java.time.LocalDateTime;

public record MatchWaitingRecommendationTarget(
		Long userId,
		Long matchRequestId,
		LocalDateTime waitingStartedAt
) {
}
