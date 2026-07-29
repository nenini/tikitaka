package com.date.backend.domain.match.application;

import java.time.LocalDateTime;

public record MatchRejectedEvent(
		Long matchPairId,
		Long rejectedBy,
		Long recipientUserId,
		LocalDateTime rejectedAt
) {
}
