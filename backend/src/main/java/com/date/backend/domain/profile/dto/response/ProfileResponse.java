package com.date.backend.domain.profile.dto.response;

import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;

public record ProfileResponse(
		Long userId,
		String nickname,
		Gender gender,
		String regionCity,
		boolean onboardingCompleted
) {
	public static ProfileResponse from(Profile profile) {
		return new ProfileResponse(
				profile.getUserId(),
				profile.getNickname(),
				profile.getGender(),
				profile.getRegionCity(),
				profile.isOnboardingCompleted()
		);
	}
}
