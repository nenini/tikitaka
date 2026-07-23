package com.date.backend.domain.profile.dto.response;

import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;

public record PublicProfileResponse(
		String nickname,
		Gender gender,
		String regionCity,
		int age
) {
	public static PublicProfileResponse from(Profile profile, int age) {
		return new PublicProfileResponse(
				profile.getNickname(),
				profile.getGender(),
				profile.getRegionCity(),
				age
		);
	}
}
