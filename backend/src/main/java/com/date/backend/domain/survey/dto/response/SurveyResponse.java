package com.date.backend.domain.survey.dto.response;

import com.date.backend.domain.survey.domain.PreferredAgeRange;
import com.date.backend.domain.survey.domain.PreferredFaceTag;
import com.date.backend.domain.survey.domain.PreferredTrait;
import com.date.backend.domain.survey.domain.UserPracticeGoal;
import com.date.backend.domain.survey.domain.UserTrait;

import java.util.List;

public record SurveyResponse(
		Long userId,
		SurveyFaceTagResponse preferredFaceTag,
		List<SurveyTraitResponse> preferredTraits,
		List<SurveyTraitResponse> userTraits,
		short minPreferredAge,
		short maxPreferredAge,
		List<SurveyPracticeGoalResponse> practiceGoals
) {
	public static SurveyResponse of(
			Long userId,
			PreferredFaceTag preferredFaceTag,
			List<PreferredTrait> preferredTraits,
			List<UserTrait> userTraits,
			PreferredAgeRange preferredAgeRange,
			List<UserPracticeGoal> practiceGoals
	) {
		return new SurveyResponse(
				userId,
				SurveyFaceTagResponse.from(preferredFaceTag.getFaceTag()),
				preferredTraits.stream()
						.map(PreferredTrait::getTrait)
						.map(SurveyTraitResponse::from)
						.toList(),
				userTraits.stream()
						.map(UserTrait::getTrait)
						.map(SurveyTraitResponse::from)
						.toList(),
				preferredAgeRange.getMinPreferredAge(),
				preferredAgeRange.getMaxPreferredAge(),
				practiceGoals.stream()
						.map(UserPracticeGoal::getPracticeGoal)
						.map(SurveyPracticeGoalResponse::from)
						.toList()
		);
	}
}
