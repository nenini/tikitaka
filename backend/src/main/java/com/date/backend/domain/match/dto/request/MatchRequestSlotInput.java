package com.date.backend.domain.match.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

import java.time.DayOfWeek;
import java.time.LocalTime;

public record MatchRequestSlotInput(
		@NotNull
		@Schema(example = "MONDAY")
		DayOfWeek dayOfWeek,

		@NotNull
		@Schema(type = "string", example = "19:00")
		LocalTime startTime,

		@NotNull
		@Schema(type = "string", example = "22:00")
		LocalTime endTime
) {
}
