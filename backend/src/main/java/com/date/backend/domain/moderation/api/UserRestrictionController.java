package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.application.UserRestrictionPolicy;
import com.date.backend.domain.moderation.dto.response.UserRestrictionStatusResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me/restrictions")
public class UserRestrictionController implements UserRestrictionSwaggerDocs {
	private final UserRestrictionPolicy restrictionPolicy;
	public UserRestrictionController(UserRestrictionPolicy restrictionPolicy) { this.restrictionPolicy = restrictionPolicy; }
	@GetMapping
	@Override
	public ApiResponse<UserRestrictionStatusResponse> get(@AuthenticationPrincipal AuthUser authUser) {
		return ApiResponse.success(restrictionPolicy.getStatus(authUser.userId()));
	}
}
