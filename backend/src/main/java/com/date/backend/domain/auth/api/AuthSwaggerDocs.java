package com.date.backend.domain.auth.api;

import com.date.backend.domain.auth.dto.request.LoginRequest;
import com.date.backend.domain.auth.dto.request.LogoutRequest;
import com.date.backend.domain.auth.dto.request.PasswordResetConfirmRequest;
import com.date.backend.domain.auth.dto.request.PasswordResetRequest;
import com.date.backend.domain.auth.dto.request.RefreshTokenRequest;
import com.date.backend.domain.auth.dto.request.SignupRequest;
import com.date.backend.domain.auth.dto.request.WithdrawAccountRequest;
import com.date.backend.domain.auth.dto.response.AuthTokenResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;

@Tag(name = "인증", description = "회원가입, 로그인, 토큰, 비밀번호 재설정 및 회원 탈퇴 API")
public interface AuthSwaggerDocs {

	@Operation(
			summary = "소셜 로그인 시작",
			description = "Google 또는 Naver 인증 화면으로 이동합니다. provider에는 google 또는 naver를 입력합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "302",
					description = "OAuth 제공자 인증 화면으로 이동"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "지원하지 않는 OAuth 제공자"
			)
	})
	ResponseEntity<Void> startOAuth(
			@Parameter(description = "OAuth 제공자", example = "google") String provider
	);

	@Operation(
			summary = "소셜 로그인 콜백",
			description = "OAuth 제공자의 인가 코드를 검증해 토큰을 발급한 뒤, 프론트엔드 콜백 라우트로 302 리다이렉트합니다."
					+ " 토큰은 URL 해시 프래그먼트로 전달됩니다(SPA 가 수신·저장)."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "302",
					description = "소셜 로그인 성공 — 프론트엔드 콜백으로 리다이렉트"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "유효하지 않은 state 또는 요청값"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "OAuth 인증 실패")
	})
	ResponseEntity<Void> oauthCallback(
			@Parameter(description = "OAuth 제공자", example = "google") String provider,
			@Parameter(description = "OAuth 인가 코드") String code,
			@Parameter(description = "CSRF 방지용 상태값") String state,
			@Parameter(hidden = true) String cookieState
	);

	@Operation(
			summary = "이메일 회원가입",
			description = "이메일과 비밀번호, 사용자 기본 정보로 계정을 생성하고 인증 토큰을 발급합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "회원가입 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 검증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "이미 가입된 이메일")
	})
	ApiResponse<AuthTokenResponse> signup(@Valid SignupRequest request);

	@Operation(
			summary = "로그인",
			description = "이메일과 비밀번호를 검증하고 Access Token과 Refresh Token을 발급합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그인 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "이메일 또는 비밀번호 불일치"
			)
	})
	ApiResponse<AuthTokenResponse> login(@Valid LoginRequest request);

	@Operation(
			summary = "토큰 재발급",
			description = "유효한 Refresh Token으로 새로운 Access Token과 Refresh Token을 발급합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "토큰 재발급 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "유효하지 않거나 만료된 Refresh Token"
			)
	})
	ApiResponse<AuthTokenResponse> refresh(@Valid RefreshTokenRequest request);

	@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
	@Operation(
			summary = "로그아웃",
			description = "Bearer Access Token으로 인증하고 전달받은 Refresh Token을 폐기합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그아웃 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패")
	})
	ApiResponse<Void> logout(@Valid LogoutRequest request);

	@Operation(
			summary = "비밀번호 재설정 메일 요청",
			description = "가입된 이메일에 일회용 비밀번호 재설정 링크를 발송합니다. 계정 존재 여부와 관계없이 동일하게 응답합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "202", description = "요청 접수 완료"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "이메일 형식 또는 요청 본문 오류"
			)
	})
	ApiResponse<Void> requestPasswordReset(@Valid PasswordResetRequest request);

	@Operation(
			summary = "비밀번호 재설정",
			description = "메일로 전달된 일회용 토큰을 검증하고 새 비밀번호로 변경합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "비밀번호 변경 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "유효하지 않거나 만료된 재설정 토큰"
			)
	})
	ApiResponse<Void> resetPassword(@Valid PasswordResetConfirmRequest request);

	@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
	@Operation(
			summary = "회원 탈퇴",
			description = "Bearer Access Token과 현재 비밀번호로 본인을 확인한 후 계정을 탈퇴 상태로 변경하고 인증 세션을 폐기합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "회원 탈퇴 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패 또는 비밀번호 불일치"
			)
	})
	ApiResponse<Void> withdrawAccount(
			@Parameter(hidden = true) AuthUser authUser,
			@Valid WithdrawAccountRequest request
	);
}
