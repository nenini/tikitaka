package com.date.backend.domain.admin.match.dto.response;

import com.date.backend.domain.match.domain.MatchingPolicy;

import java.time.LocalDateTime;

public record MatchingPolicyResponse(
		int faceTypeWeight,
		int personalityWeight,
		int acceptTimeoutHours,
		int minimumAcceptanceWindowMinutes,
		int minimumPreparationMinutes,
		int scheduleSearchDays,
		int recentMatchExclusionDays,
		int lateCancellationMinutes,
		long policyVersion,
		Long updatedBy,
		LocalDateTime updatedAt
) {
	public static MatchingPolicyResponse from(MatchingPolicy policy) {
		return new MatchingPolicyResponse(
				policy.getFaceTypeWeight(),
				policy.getPersonalityWeight(),
				policy.getAcceptTimeoutHours(),
				policy.getMinimumAcceptanceWindowMinutes(),
				policy.getMinimumPreparationMinutes(),
				policy.getScheduleSearchDays(),
				policy.getRecentMatchExclusionDays(),
				policy.getLateCancellationMinutes(),
				policy.getPolicyVersion(),
				policy.getUpdatedBy(),
				policy.getUpdatedAt()
		);
	}
}
