package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.policy.MatchScore;

import java.time.LocalDateTime;

public record MatchCandidate(
		MatchRequest request,
		MatchScore score,
		LocalDateTime proposedScheduledAt
) {
}
