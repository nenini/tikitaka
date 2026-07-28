package com.date.backend.domain.match.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.HashSet;
import java.util.List;

public record MatchRequestSaveRequest(
		@NotNull
		@Positive
		Short preferredAgeMin,

		@NotNull
		@Positive
		Short preferredAgeMax,

		@NotNull
		@Size(min = 1, max = 14, message = "가능 시간은 1개 이상 14개 이하로 입력해야 합니다.")
		List<@Valid @NotNull MatchRequestSlotInput> availableSlots
) {

	@JsonIgnore
	@Schema(hidden = true)
	@AssertTrue(message = "최대 선호 나이는 최소 선호 나이 이상이어야 합니다.")
	public boolean isPreferredAgeRangeValid() {
		return preferredAgeMin == null
				|| preferredAgeMax == null
				|| preferredAgeMax >= preferredAgeMin;
	}

	@JsonIgnore
	@Schema(hidden = true)
	@AssertTrue(message = "가능 시간의 종료 시각은 시작 시각보다 늦어야 합니다.")
	public boolean isSlotRangesValid() {
		return availableSlots == null
				|| availableSlots.stream()
						.filter(slot -> slot != null
								&& slot.startTime() != null
								&& slot.endTime() != null)
						.allMatch(slot -> slot.startTime().isBefore(slot.endTime()));
	}

	@JsonIgnore
	@Schema(hidden = true)
	@AssertTrue(message = "동일한 가능 시간을 중복 입력할 수 없습니다.")
	public boolean isSlotsDistinct() {
		return availableSlots == null
				|| new HashSet<>(availableSlots).size() == availableSlots.size();
	}
}
