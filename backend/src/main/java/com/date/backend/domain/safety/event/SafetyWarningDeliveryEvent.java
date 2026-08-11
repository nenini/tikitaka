package com.date.backend.domain.safety.event;

import com.date.backend.domain.safety.dto.SafetyWarningResponse;

public record SafetyWarningDeliveryEvent(
		Long targetUserId,
		SafetyWarningResponse payload
) {
}
