package com.date.backend.domain.match.application;

import java.time.LocalDateTime;

public record MatchFoundEvent(
		Long matchPairId,
		Long userAId,
		Long userBId,
		LocalDateTime matchedAt,
		LocalDateTime acceptDeadlineAt
) {
}
