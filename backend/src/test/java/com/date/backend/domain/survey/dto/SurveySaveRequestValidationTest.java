package com.date.backend.domain.survey.dto;

import com.date.backend.domain.survey.dto.request.SurveySaveRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class SurveySaveRequestValidationTest {

	@Test
	void validSurveyRequestPassesValidation() {
		SurveySaveRequest request = request(
				List.of(1L, 2L, 3L),
				List.of(4L, 5L, 6L),
				(short) 25,
				(short) 32,
				List.of(1L, 3L)
		);

		assertThat(validate(request)).isEmpty();
	}

	@Test
	void exactlyThreeDistinctTraitsMustBeSelected() {
		SurveySaveRequest request = request(
				List.of(1L, 1L, 2L),
				List.of(4L, 5L),
				(short) 25,
				(short) 32,
				List.of(1L)
		);

		assertThat(validate(request))
				.extracting(ConstraintViolation::getMessage)
				.contains(
						"원하는 상대 성격은 서로 다른 3개를 선택해야 합니다.",
						"본인 성격은 정확히 3개를 선택해야 합니다."
				);
	}

	@Test
	void preferredAgeRangeAndPracticeGoalsAreValidated() {
		SurveySaveRequest request = request(
				List.of(1L, 2L, 3L),
				List.of(4L, 5L, 6L),
				(short) 35,
				(short) 30,
				List.of(1L, 1L)
		);

		assertThat(validate(request))
				.extracting(ConstraintViolation::getMessage)
				.contains(
						"최대 선호 나이는 최소 선호 나이 이상이어야 합니다.",
						"같은 고민을 중복해서 선택할 수 없습니다."
				);
	}

	private SurveySaveRequest request(
			List<Long> preferredTraitIds,
			List<Long> userTraitIds,
			short minPreferredAge,
			short maxPreferredAge,
			List<Long> practiceGoalIds
	) {
		return new SurveySaveRequest(
				1L,
				preferredTraitIds,
				userTraitIds,
				minPreferredAge,
				maxPreferredAge,
				practiceGoalIds
		);
	}

	private Set<ConstraintViolation<SurveySaveRequest>> validate(SurveySaveRequest request) {
		try (ValidatorFactory validatorFactory = Validation.buildDefaultValidatorFactory()) {
			Validator validator = validatorFactory.getValidator();
			return validator.validate(request);
		}
	}
}
