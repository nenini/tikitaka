package com.date.backend.domain.match.dto.response;

import com.date.backend.domain.match.domain.MatchRequestSlot;

import java.time.DayOfWeek;
import java.time.LocalTime;

public record MatchRequestSlotResponse(
		DayOfWeek dayOfWeek,
		LocalTime startTime,
		LocalTime endTime
) {
	public static MatchRequestSlotResponse from(MatchRequestSlot slot) {
		return new MatchRequestSlotResponse(
				slot.getDayOfWeek(),
				slot.getStartTime(),
				slot.getEndTime()
		);
	}
}
