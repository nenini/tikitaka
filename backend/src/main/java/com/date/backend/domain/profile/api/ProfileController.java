package com.date.backend.domain.profile.api;

import com.date.backend.domain.profile.application.ProfileService;
import com.date.backend.domain.profile.dto.request.ProfileCreateRequest;
import com.date.backend.domain.profile.dto.request.ProfileUpdateRequest;
import com.date.backend.domain.profile.dto.response.OnboardingStatusResponse;
import com.date.backend.domain.profile.dto.response.ProfileResponse;
import com.date.backend.domain.profile.dto.response.PublicProfileResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/v1/users")
public class ProfileController implements ProfileSwaggerDocs {
	private final ProfileService profileService;

	public ProfileController(ProfileService profileService) {
		this.profileService = profileService;
	}

	@Override
	@PostMapping("/me/profile")
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<ProfileResponse> create(
			@AuthenticationPrincipal AuthUser authUser,
			@Valid @RequestBody ProfileCreateRequest request
	) {
		return ApiResponse.success(profileService.create(authUser.userId(), request));
	}

	@Override
	@GetMapping("/me/profile")
	public ApiResponse<ProfileResponse> getMine(@AuthenticationPrincipal AuthUser authUser) {
		return ApiResponse.success(profileService.getMine(authUser.userId()));
	}

	@Override
	@PatchMapping("/me/profile")
	public ApiResponse<ProfileResponse> update(
			@AuthenticationPrincipal AuthUser authUser,
			@Valid @RequestBody ProfileUpdateRequest request
	) {
		return ApiResponse.success(profileService.update(authUser.userId(), request));
	}

	@Override
	@GetMapping("/{userId}/public-profile")
	public ApiResponse<PublicProfileResponse> getPublicProfile(@Positive @PathVariable Long userId) {
		return ApiResponse.success(profileService.getPublicProfile(userId));
	}

	@Override
	@GetMapping("/me/onboarding-status")
	public ApiResponse<OnboardingStatusResponse> getOnboardingStatus(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(profileService.getOnboardingStatus(authUser.userId()));
	}
}
