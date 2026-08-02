package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.domain.MatchingPolicy;

public record MatchingPolicySnapshot(
		int faceTypeWeight,
		int personalityWeight,
		int acceptTimeoutHours,
		int minimumAcceptanceWindowMinutes,
		int minimumPreparationMinutes,
		int scheduleSearchDays,
		int recentMatchExclusionDays,
		int lateCancellationMinutes,
		long policyVersion
) {
	public static MatchingPolicySnapshot defaults() {
		return new MatchingPolicySnapshot(50, 50, 8, 60, 60, 7, 7, 60, 1);
	}

	public static MatchingPolicySnapshot from(MatchingPolicy policy) {
		return new MatchingPolicySnapshot(
				policy.getFaceTypeWeight(),
				policy.getPersonalityWeight(),
				policy.getAcceptTimeoutHours(),
				policy.getMinimumAcceptanceWindowMinutes(),
				policy.getMinimumPreparationMinutes(),
				policy.getScheduleSearchDays(),
				policy.getRecentMatchExclusionDays(),
				policy.getLateCancellationMinutes(),
				policy.getPolicyVersion()
		);
	}
}
