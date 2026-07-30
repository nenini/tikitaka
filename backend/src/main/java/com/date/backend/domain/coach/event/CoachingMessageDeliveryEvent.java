package com.date.backend.domain.coach.event;

import com.date.backend.domain.coach.dto.CoachingMessageResponse;

public record CoachingMessageDeliveryEvent(
		Long targetUserId,
		CoachingMessageResponse payload
) {
}
