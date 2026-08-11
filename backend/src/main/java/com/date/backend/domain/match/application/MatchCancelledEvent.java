package com.date.backend.domain.match.application;

import java.time.LocalDateTime;

public record MatchCancelledEvent(
		Long matchPairId,
		Long cancelledBy,
		Long recipientUserId,
		LocalDateTime cancelledAt,
		boolean lateCancellation
) {
}
