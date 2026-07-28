package com.date.backend.domain.match.policy;

import java.math.BigDecimal;

public record MatchScore(
		BigDecimal faceScore,
		BigDecimal traitScore,
		BigDecimal totalScore
) {
}
