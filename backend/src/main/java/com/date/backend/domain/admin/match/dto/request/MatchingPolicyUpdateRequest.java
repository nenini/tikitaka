package com.date.backend.domain.admin.match.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record MatchingPolicyUpdateRequest(
		@Min(0) @Max(100) @Schema(example = "50") Integer faceTypeWeight,
		@Min(0) @Max(100) @Schema(example = "50") Integer personalityWeight,
		@Min(1) @Max(24) @Schema(example = "8") Integer acceptTimeoutHours,
		@Min(1) @Max(1440) @Schema(example = "60") Integer minimumAcceptanceWindowMinutes,
		@Min(0) @Max(1440) @Schema(example = "60") Integer minimumPreparationMinutes,
		@Min(1) @Max(30) @Schema(example = "7") Integer scheduleSearchDays,
		@Min(1) @Max(365) @Schema(example = "7") Integer recentMatchExclusionDays,
		@Min(1) @Max(1440) @Schema(example = "60") Integer lateCancellationMinutes
) {
	@JsonIgnore
	@Schema(hidden = true)
	public boolean isEmpty() {
		return faceTypeWeight == null
				&& personalityWeight == null
				&& acceptTimeoutHours == null
				&& minimumAcceptanceWindowMinutes == null
				&& minimumPreparationMinutes == null
				&& scheduleSearchDays == null
				&& recentMatchExclusionDays == null
				&& lateCancellationMinutes == null;
	}

	@JsonIgnore
	@Schema(hidden = true)
	public boolean hasOnlyOneWeight() {
		return (faceTypeWeight == null) != (personalityWeight == null);
	}
}
