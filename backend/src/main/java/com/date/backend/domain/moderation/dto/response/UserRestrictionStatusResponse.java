package com.date.backend.domain.moderation.dto.response;

import java.util.List;

public record UserRestrictionStatusResponse(boolean restricted, long accumulatedNoShowCount,
		List<RestrictionItemResponse> activeRestrictions) {}
