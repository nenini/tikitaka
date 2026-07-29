package com.date.backend.domain.match.application;

import java.time.LocalDateTime;

public record MatchConfirmedEvent(
		Long matchPairId,
		Long userAId,
		Long userBId,
		LocalDateTime confirmedAt,
		LocalDateTime scheduledAt
) {
}
