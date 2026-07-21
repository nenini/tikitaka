package com.date.backend.domain.auth.api;

import com.date.backend.domain.auth.application.AuthService;
import com.date.backend.domain.auth.dto.AuthTokenResponse;
import com.date.backend.domain.auth.dto.LoginRequest;
import com.date.backend.domain.auth.dto.LogoutRequest;
import com.date.backend.domain.auth.dto.RefreshTokenRequest;
import com.date.backend.domain.auth.dto.SignupRequest;
import com.date.backend.global.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
	private final AuthService authService;

	public AuthController(AuthService authService) {
		this.authService = authService;
	}

	@PostMapping("/signup")
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<AuthTokenResponse> signup(@Valid @RequestBody SignupRequest request) {
		return ApiResponse.success(authService.signup(request));
	}

	@PostMapping("/login")
	public ApiResponse<AuthTokenResponse> login(@Valid @RequestBody LoginRequest request) {
		return ApiResponse.success(authService.login(request));
	}

	@PostMapping("/refresh")
	public ApiResponse<AuthTokenResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
		return ApiResponse.success(authService.refresh(request.refreshToken()));
	}

	@PostMapping("/logout")
	public ApiResponse<Void> logout(@Valid @RequestBody LogoutRequest request) {
		authService.logout(request.refreshToken());
		return ApiResponse.successWithoutData();
	}
}
