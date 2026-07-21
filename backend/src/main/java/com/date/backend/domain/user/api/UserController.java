package com.date.backend.domain.user.api;

import com.date.backend.domain.auth.application.AuthService;
import com.date.backend.domain.auth.dto.UserResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {
	private final AuthService authService;

	public UserController(AuthService authService) {
		this.authService = authService;
	}

	@GetMapping("/me")
	public ApiResponse<UserResponse> me(@AuthenticationPrincipal AuthUser authUser) {
		return ApiResponse.success(authService.getMe(authUser.userId()));
	}
}
