package com.date.backend.domain.silence.event;

import com.date.backend.domain.silence.dto.ContextualQuestionRecommendationResponse;

public record ContextualQuestionDeliveryEvent(
		Long targetUserId,
		ContextualQuestionRecommendationResponse payload
) {
}
