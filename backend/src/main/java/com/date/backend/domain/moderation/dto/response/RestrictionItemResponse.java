package com.date.backend.domain.moderation.dto.response;

import com.date.backend.domain.moderation.domain.UserSanction;
import java.time.LocalDateTime;

public record RestrictionItemResponse(Long restrictionId, String type, String reason,
		LocalDateTime startsAt, LocalDateTime endsAt) {
	public static RestrictionItemResponse from(UserSanction sanction) {
		return new RestrictionItemResponse(sanction.getId(), sanction.getSanctionType(),
				sanction.getReason(), sanction.getStartsAt(), sanction.getEndsAt());
	}
}
