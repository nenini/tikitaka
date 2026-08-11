package com.date.backend.domain.match.application;

import java.time.LocalDateTime;

public record MatchExpiredEvent(
		Long matchPairId,
		Long userAId,
		Long userBId,
		LocalDateTime expiredAt
) {
}
