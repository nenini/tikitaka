package com.date.backend.domain.silence.dto;

import java.util.List;

public record QuestionCardListResponse(
		Long sessionId,
		List<QuestionCardResponse> questions
) {
}
