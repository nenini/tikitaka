package com.date.backend.domain.survey.dto.response;

import com.date.backend.domain.survey.domain.TraitCatalog;

public record SurveyTraitResponse(
		Long id,
		String code,
		String name
) {
	public static SurveyTraitResponse from(TraitCatalog trait) {
		return new SurveyTraitResponse(
				trait.getId(),
				trait.getCode(),
				trait.getName()
		);
	}
}
