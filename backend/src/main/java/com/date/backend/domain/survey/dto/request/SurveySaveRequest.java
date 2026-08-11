package com.date.backend.domain.survey.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SurveySaveRequest(
		@NotNull
		@Positive
		Long preferredFaceTagId,

		@NotNull
		@Size(min = 3, max = 3, message = "원하는 상대 성격은 정확히 3개를 선택해야 합니다.")
		List<@NotNull @Positive Long> preferredTraitIds,

		@NotNull
		@Size(min = 3, max = 3, message = "본인 성격은 정확히 3개를 선택해야 합니다.")
		List<@NotNull @Positive Long> userTraitIds,

		@NotNull
		@Positive
		Short minPreferredAge,

		@NotNull
		@Positive
		Short maxPreferredAge,

		@NotNull
		@Size(min = 1, message = "고민은 1개 이상 선택해야 합니다.")
		List<@NotNull @Positive Long> practiceGoalIds
) {

	@JsonIgnore
	@Schema(hidden = true)
	@AssertTrue(message = "원하는 상대 성격은 서로 다른 3개를 선택해야 합니다.")
	public boolean isPreferredTraitsDistinct() {
		return hasDistinctElements(preferredTraitIds);
	}

	@JsonIgnore
	@Schema(hidden = true)
	@AssertTrue(message = "본인 성격은 서로 다른 3개를 선택해야 합니다.")
	public boolean isUserTraitsDistinct() {
		return hasDistinctElements(userTraitIds);
	}

	@JsonIgnore
	@Schema(hidden = true)
	@AssertTrue(message = "같은 고민을 중복해서 선택할 수 없습니다.")
	public boolean isPracticeGoalsDistinct() {
		return hasDistinctElements(practiceGoalIds);
	}

	@JsonIgnore
	@Schema(hidden = true)
	@AssertTrue(message = "최대 선호 나이는 최소 선호 나이 이상이어야 합니다.")
	public boolean isPreferredAgeRangeValid() {
		return minPreferredAge == null
				|| maxPreferredAge == null
				|| maxPreferredAge >= minPreferredAge;
	}

	private static boolean hasDistinctElements(List<Long> ids) {
		return ids == null || ids.stream().distinct().count() == ids.size();
	}
}
