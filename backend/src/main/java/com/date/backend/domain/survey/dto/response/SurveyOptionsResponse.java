package com.date.backend.domain.survey.dto.response;

import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.domain.PracticeGoalCatalog;
import com.date.backend.domain.survey.domain.TraitCatalog;

import java.util.List;

public record SurveyOptionsResponse(
		List<SurveyFaceTagResponse> faceTags,
		List<SurveyTraitResponse> traits,
		List<SurveyPracticeGoalResponse> practiceGoals
) {
	public static SurveyOptionsResponse of(
			List<FaceTagCatalog> faceTags,
			List<TraitCatalog> traits,
			List<PracticeGoalCatalog> practiceGoals
	) {
		return new SurveyOptionsResponse(
				faceTags.stream()
						.map(SurveyFaceTagResponse::from)
						.toList(),
				traits.stream()
						.map(SurveyTraitResponse::from)
						.toList(),
				practiceGoals.stream()
						.map(SurveyPracticeGoalResponse::from)
						.toList()
		);
	}
}
