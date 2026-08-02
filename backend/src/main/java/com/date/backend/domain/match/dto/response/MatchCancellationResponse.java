package com.date.backend.domain.match.dto.response;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchStatus;

import java.time.LocalDateTime;

public record MatchCancellationResponse(
		Long matchPairId,
		MatchStatus status,
		LocalDateTime cancelledAt,
		Long cancelledBy,
		String cancellationReason,
		boolean lateCancellation
) {

	public static MatchCancellationResponse from(MatchPair pair) {
		return new MatchCancellationResponse(
				pair.getId(),
				pair.getStatus(),
				pair.getCancelledAt(),
				pair.getCancelledBy(),
				pair.getCancellationReason(),
				pair.isLateCancellation()
		);
	}
}
