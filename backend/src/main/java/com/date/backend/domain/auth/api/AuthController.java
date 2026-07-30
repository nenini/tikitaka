package com.date.backend.domain.auth.api;

import com.date.backend.domain.auth.application.AuthService;
import com.date.backend.domain.auth.application.OAuthService;
import com.date.backend.domain.auth.application.PasswordResetService;
import com.date.backend.domain.auth.domain.OAuthProvider;
import com.date.backend.domain.auth.dto.request.LoginRequest;
import com.date.backend.domain.auth.dto.request.LogoutRequest;
import com.date.backend.domain.auth.dto.request.PasswordResetConfirmRequest;
import com.date.backend.domain.auth.dto.request.PasswordResetRequest;
import com.date.backend.domain.auth.dto.request.RefreshTokenRequest;
import com.date.backend.domain.auth.dto.request.SignupRequest;
import com.date.backend.domain.auth.dto.request.WithdrawAccountRequest;
import com.date.backend.domain.auth.dto.response.AuthTokenResponse;
import com.date.backend.domain.user.application.UserAccountService;
import com.date.backend.domain.auth.oauth.OAuthStateService;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController implements AuthSwaggerDocs {
	private final AuthService authService;
	private final PasswordResetService passwordResetService;
	private final UserAccountService userAccountService;
	private final OAuthService oauthService;
	private final OAuthStateService oauthStateService;

	/** OAuth 성공 후 토큰을 실어 보낼 프론트엔드 콜백 라우트. (로컬 기본값; 배포 시 환경변수로 덮어쓴다) */
	@Value("${auth.oauth.frontend-redirect-uri:http://localhost:5173/oauth/callback}")
	private String frontendRedirectUri;

	public AuthController(
			AuthService authService,
			PasswordResetService passwordResetService,
			UserAccountService userAccountService,
			OAuthService oauthService,
			OAuthStateService oauthStateService
	) {
		this.authService = authService;
		this.passwordResetService = passwordResetService;
		this.userAccountService = userAccountService;
		this.oauthService = oauthService;
		this.oauthStateService = oauthStateService;
	}

	@Override
	@GetMapping("/oauth2/{provider}")
	public ResponseEntity<Void> startOAuth(@PathVariable String provider) {
		OAuthProvider oauthProvider = OAuthProvider.from(provider);
		String state = oauthStateService.create(oauthProvider);
		return ResponseEntity.status(HttpStatus.FOUND)
				.header(HttpHeaders.SET_COOKIE, oauthStateService.cookie(state).toString())
				.location(oauthService.authorizationUri(oauthProvider, state))
				.build();
	}

	@Override
	@GetMapping("/oauth2/{provider}/callback")
	public ResponseEntity<Void> oauthCallback(
			@PathVariable String provider,
			@RequestParam String code,
			@RequestParam String state,
			@CookieValue(name = OAuthStateService.COOKIE_NAME, required = false) String cookieState
	) {
		OAuthProvider oauthProvider = OAuthProvider.from(provider);
		oauthStateService.validate(oauthProvider, state, cookieState);
		AuthTokenResponse tokens = oauthService.login(oauthProvider, code, state);
		// provider redirect-uri 는 백엔드 자신이라 콜백이 최상위 브라우저를 여기로 보낸다.
		// SPA 가 토큰을 받도록 프론트 콜백 라우트로 302 리다이렉트하며 토큰을 해시 프래그먼트로 전달한다.
		// (해시는 서버로 전송되지 않아 로그/리퍼러에 토큰이 남지 않는다)
		String fragment = "accessToken=" + enc(tokens.accessToken())
				+ "&refreshToken=" + enc(tokens.refreshToken())
				+ "&tokenType=" + enc(tokens.tokenType())
				+ "&accessTokenExpiresIn=" + tokens.accessTokenExpiresIn()
				+ "&refreshTokenExpiresIn=" + tokens.refreshTokenExpiresIn();
		URI location = UriComponentsBuilder.fromUriString(frontendRedirectUri)
				.fragment(fragment)
				.build(true)
				.toUri();
		return ResponseEntity.status(HttpStatus.FOUND)
				.header(HttpHeaders.SET_COOKIE, oauthStateService.clearCookie().toString())
				.location(location)
				.build();
	}

	private static String enc(String value) {
		return URLEncoder.encode(value, StandardCharsets.UTF_8);
	}

	@Override
	@PostMapping("/signup")
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<AuthTokenResponse> signup(@RequestBody SignupRequest request) {
		return ApiResponse.success(authService.signup(request));
	}

	@Override
	@PostMapping("/login")
	public ApiResponse<AuthTokenResponse> login(@RequestBody LoginRequest request) {
		return ApiResponse.success(authService.login(request));
	}

	@Override
	@PostMapping("/refresh")
	public ApiResponse<AuthTokenResponse> refresh(@RequestBody RefreshTokenRequest request) {
		return ApiResponse.success(authService.refresh(request.refreshToken()));
	}

	@Override
	@PostMapping("/logout")
	public ApiResponse<Void> logout(@RequestBody LogoutRequest request) {
		authService.logout(request.refreshToken());
		return ApiResponse.successWithoutData();
	}

	@Override
	@PostMapping("/password/reset-request")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public ApiResponse<Void> requestPasswordReset(@RequestBody PasswordResetRequest request) {
		passwordResetService.request(request.email());
		return ApiResponse.successWithoutData();
	}

	@Override
	@PatchMapping("/password/reset")
	public ApiResponse<Void> resetPassword(@RequestBody PasswordResetConfirmRequest request) {
		passwordResetService.reset(request.token(), request.newPassword());
		return ApiResponse.successWithoutData();
	}

	@Override
	@DeleteMapping("/account")
	public ApiResponse<Void> withdrawAccount(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestBody WithdrawAccountRequest request
	) {
		userAccountService.withdraw(authUser.userId(), request.password());
		return ApiResponse.successWithoutData();
	}
}
