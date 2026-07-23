package com.date.backend.domain.survey.dto.response;

import com.date.backend.domain.survey.domain.GoalCategory;
import com.date.backend.domain.survey.domain.PracticeGoalCatalog;

public record SurveyPracticeGoalResponse(
		Long id,
		String code,
		String name,
		GoalCategory category
) {
	public static SurveyPracticeGoalResponse from(PracticeGoalCatalog practiceGoal) {
		return new SurveyPracticeGoalResponse(
				practiceGoal.getId(),
				practiceGoal.getCode(),
				practiceGoal.getName(),
				practiceGoal.getCategory()
		);
	}
}
