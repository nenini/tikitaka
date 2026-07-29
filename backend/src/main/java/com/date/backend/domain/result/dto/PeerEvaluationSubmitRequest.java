package com.date.backend.domain.result.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record PeerEvaluationSubmitRequest(
		@Min(1) @Max(5) int comfortScore,
		@Min(1) @Max(5) int questionConnectionScore,
		@Min(1) @Max(5) int listeningScore,
		@Min(1) @Max(5) int reactionScore,
		@Min(1) @Max(5) int balanceScore,
		@Min(1) @Max(5) int mannerScore,
		@Size(max = 1000) String goodBehaviorText,
		@Size(max = 1000) String improvementText
) {
}
