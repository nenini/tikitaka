package com.date.backend.domain.match.dto.response;

import com.date.backend.domain.match.domain.MatchResponseStatus;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.profile.dto.response.PublicProfileResponse;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record MatchResultResponse(
		Long matchPairId,
		Long roomId,
		MatchStatus status,
		MatchResponseStatus myResponse,
		MatchResponseStatus partnerResponse,
		PublicProfileResponse partnerProfile,
		BigDecimal faceScore,
		BigDecimal traitScore,
		BigDecimal totalScore,
		LocalDateTime acceptDeadlineAt,
		LocalDateTime matchedAt,
		LocalDateTime proposedScheduledAt,
		LocalDateTime scheduledAt,
		LocalDateTime confirmedAt
) {
}
