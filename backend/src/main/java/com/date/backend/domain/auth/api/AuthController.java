package com.date.backend.domain.auth.api;

import com.date.backend.domain.auth.application.AuthService;
import com.date.backend.domain.auth.application.PasswordResetService;
import com.date.backend.domain.auth.dto.AuthTokenResponse;
import com.date.backend.domain.auth.dto.LoginRequest;
import com.date.backend.domain.auth.dto.PasswordResetConfirmRequest;
import com.date.backend.domain.auth.dto.PasswordResetRequest;
import com.date.backend.domain.auth.dto.LogoutRequest;
import com.date.backend.domain.auth.dto.RefreshTokenRequest;
import com.date.backend.domain.auth.dto.SignupRequest;
import com.date.backend.domain.auth.dto.WithdrawAccountRequest;
import com.date.backend.domain.user.application.UserAccountService;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "인증", description = "회원가입, 로그인, 토큰, 비밀번호 재설정 및 회원 탈퇴 API")
public class AuthController {
	private final AuthService authService;
	private final PasswordResetService passwordResetService;
	private final UserAccountService userAccountService;

	public AuthController(
			AuthService authService,
			PasswordResetService passwordResetService,
			UserAccountService userAccountService
	) {
		this.authService = authService;
		this.passwordResetService = passwordResetService;
		this.userAccountService = userAccountService;
	}

	@PostMapping("/signup")
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "이메일 회원가입", description = "이메일과 비밀번호, 사용자 기본 정보로 계정을 생성하고 인증 토큰을 발급합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "회원가입 성공")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 검증 실패")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 가입된 이메일")
	public ApiResponse<AuthTokenResponse> signup(@Valid @RequestBody SignupRequest request) {
		return ApiResponse.success(authService.signup(request));
	}

	@PostMapping("/login")
	@Operation(summary = "로그인", description = "이메일과 비밀번호를 검증하고 Access Token과 Refresh Token을 발급합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그인 성공")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "이메일 또는 비밀번호 불일치")
	public ApiResponse<AuthTokenResponse> login(@Valid @RequestBody LoginRequest request) {
		return ApiResponse.success(authService.login(request));
	}

	@PostMapping("/refresh")
	@Operation(summary = "토큰 재발급", description = "유효한 Refresh Token으로 새로운 Access Token과 Refresh Token을 발급합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "토큰 재발급 성공")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "유효하지 않거나 만료된 Refresh Token")
	public ApiResponse<AuthTokenResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
		return ApiResponse.success(authService.refresh(request.refreshToken()));
	}

	@PostMapping("/logout")
	@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
	@Operation(summary = "로그아웃", description = "Bearer Access Token으로 인증하고 전달받은 Refresh Token을 폐기합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그아웃 성공")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패")
	public ApiResponse<Void> logout(@Valid @RequestBody LogoutRequest request) {
		authService.logout(request.refreshToken());
		return ApiResponse.successWithoutData();
	}

	@PostMapping("/password/reset-request")
	@ResponseStatus(HttpStatus.ACCEPTED)
	@Operation(summary = "비밀번호 재설정 메일 요청", description = "가입된 이메일에 일회용 비밀번호 재설정 링크를 발송합니다. 계정 존재 여부와 관계없이 동일하게 응답합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "202", description = "요청 접수 완료")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "이메일 형식 또는 요청 본문 오류")
	public ApiResponse<Void> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
		passwordResetService.request(request.email());
		return ApiResponse.successWithoutData();
	}

	@PatchMapping("/password/reset")
	@Operation(summary = "비밀번호 재설정", description = "메일로 전달된 일회용 토큰을 검증하고 새 비밀번호로 변경합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "비밀번호 변경 성공")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "유효하지 않거나 만료된 재설정 토큰")
	public ApiResponse<Void> resetPassword(@Valid @RequestBody PasswordResetConfirmRequest request) {
		passwordResetService.reset(request.token(), request.newPassword());
		return ApiResponse.successWithoutData();
	}

	@DeleteMapping("/account")
	@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
	@Operation(summary = "회원 탈퇴", description = "Bearer Access Token과 현재 비밀번호로 본인을 확인한 후 계정을 탈퇴 상태로 변경하고 인증 세션을 폐기합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "회원 탈퇴 성공")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패 또는 비밀번호 불일치")
	public ApiResponse<Void> withdrawAccount(
			@AuthenticationPrincipal AuthUser authUser,
			@Valid @RequestBody WithdrawAccountRequest request
	) {
		userAccountService.withdraw(authUser.userId(), request.password());
		return ApiResponse.successWithoutData();
	}
}
