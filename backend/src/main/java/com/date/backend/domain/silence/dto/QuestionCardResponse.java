package com.date.backend.domain.silence.dto;

import com.date.backend.domain.silence.domain.QuestionCard;

public record QuestionCardResponse(
		Long questionCardId,
		String code,
		String category,
		String content
) {
	public static QuestionCardResponse from(QuestionCard card) {
		return new QuestionCardResponse(
				card.getId(),
				card.getCode(),
				card.getCategory(),
				card.getContent()
		);
	}
}
