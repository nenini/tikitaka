package com.date.backend.domain.user.api;

import com.date.backend.domain.auth.application.AuthService;
import com.date.backend.domain.auth.dto.UserResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "사용자", description = "인증 사용자 정보 API")
public class UserController {
	private final AuthService authService;

	public UserController(AuthService authService) {
		this.authService = authService;
	}

	@GetMapping("/me")
	@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
	@Operation(summary = "내 정보 조회", description = "Bearer Access Token으로 인증된 사용자의 계정 정보를 조회합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패")
	public ApiResponse<UserResponse> me(@AuthenticationPrincipal AuthUser authUser) {
		return ApiResponse.success(authService.getMe(authUser.userId()));
	}
}
