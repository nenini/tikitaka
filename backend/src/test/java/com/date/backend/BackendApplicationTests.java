package com.date.backend;

import com.date.backend.domain.auth.domain.PasswordResetToken;
import com.date.backend.domain.auth.application.OAuthService;
import com.date.backend.domain.auth.domain.OAuthProvider;
import com.date.backend.domain.auth.dto.response.AuthTokenResponse;
import com.date.backend.domain.auth.oauth.OAuthClient;
import com.date.backend.domain.auth.oauth.OAuthUserInfo;
import com.date.backend.domain.auth.password.PasswordResetMailSender;
import com.date.backend.domain.auth.repository.OAuthAccountRepository;
import com.date.backend.domain.auth.repository.PasswordResetTokenRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class BackendApplicationTests {
	@LocalServerPort
	private int port;

	@Autowired
	private ObjectMapper objectMapper;
	@Autowired
	private UserRepository userRepository;
	@Autowired
	private PasswordResetTokenRepository passwordResetTokenRepository;
	@Autowired
	private OAuthService oauthService;
	@Autowired
	private OAuthAccountRepository oauthAccountRepository;

	@MockitoBean
	private PasswordResetMailSender passwordResetMailSender;
	@MockitoBean
	private OAuthClient oauthClient;

	@BeforeEach
	void clearMailSenderInvocations() {
		clearInvocations(passwordResetMailSender);
	}

	@Test
	void contextLoads() {
	}

	@Test
	void oauthLoginCreatesAccountAndReusesItOnNextLogin() {
		String providerUserId = "google-" + UUID.randomUUID();
		String email = "oauth-" + UUID.randomUUID() + "@example.com";
		OAuthUserInfo userInfo = new OAuthUserInfo(providerUserId, email, "OAuth 사용자");
		org.mockito.Mockito.when(oauthClient.authenticate(OAuthProvider.GOOGLE, "code", "state"))
				.thenReturn(userInfo);

		long usersBefore = userRepository.count();
		long accountsBefore = oauthAccountRepository.count();
		AuthTokenResponse first = oauthService.login(OAuthProvider.GOOGLE, "code", "state");
		AuthTokenResponse second = oauthService.login(OAuthProvider.GOOGLE, "code", "state");

		assertThat(first.accessToken()).isNotBlank();
		assertThat(second.refreshToken()).isNotBlank();
		assertThat(userRepository.count()).isEqualTo(usersBefore + 1);
		assertThat(oauthAccountRepository.count()).isEqualTo(accountsBefore + 1);
		User oauthUser = userRepository.findByEmail(email).orElseThrow();
		assertThat(oauthUser.getPasswordHash()).isNull();
		assertThat(oauthUser.getBirthDate()).isNull();
	}

	@Test
	void healthEndpointIsAvailable() throws Exception {
		HttpResponse<String> response = get("/actuator/health");

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).contains("\"status\":\"UP\"");
	}

	@Test
	void openApiDocumentIsAvailable() throws Exception {
		HttpResponse<String> response = get("/v3/api-docs");

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body())
				.contains("\"title\":\"DATE Backend API\"")
				.contains("\"summary\":\"로그인\"")
				.contains("\"summary\":\"내 정보 조회\"")
				.contains("\"BearerAuth\"");
	}

	@Test
	void unknownResourceUsesCommonErrorResponse() throws Exception {
		HttpResponse<String> response = get("/api/not-found");

		assertThat(response.statusCode()).isEqualTo(404);
		assertThat(response.body())
				.contains("\"success\":false")
				.contains("\"code\":\"RESOURCE_NOT_FOUND\"")
				.contains("\"path\":\"/api/not-found\"");
	}

	@Test
	void signupThenMeReturnsAuthenticatedUser() throws Exception {
		String email = "user-" + UUID.randomUUID() + "@example.com";
		String body = """
				{
				  "email": "%s",
				  "password": "password123!",
				  "realName": "홍길동",
				  "phoneNumber": "010-1234-5678",
				  "birthDate": "1995-01-01"
				}
				""".formatted(email);

		HttpResponse<String> signupResponse = post("/api/v1/auth/signup", body);

		assertThat(signupResponse.statusCode()).isEqualTo(201);
		JsonNode data = objectMapper.readTree(signupResponse.body()).path("data");
		assertThat(data.path("tokenType").asText()).isEqualTo("Bearer");
		assertThat(data.path("accessToken").asText()).isNotBlank();
		assertThat(data.path("refreshToken").asText()).isNotBlank();

		HttpResponse<String> meResponse = get("/api/v1/users/me", data.path("accessToken").asText());

		assertThat(meResponse.statusCode()).isEqualTo(200);
		assertThat(meResponse.body())
				.contains("\"email\":\"" + email + "\"")
				.contains("\"realName\":\"홍길동\"")
				.contains("\"role\":\"USER\"");
	}

	@Test
	void meWithoutTokenReturnsUnauthorized() throws Exception {
		HttpResponse<String> response = get("/api/v1/users/me");

		assertThat(response.statusCode()).isEqualTo(401);
		assertThat(response.body())
				.contains("\"success\":false")
				.contains("\"code\":\"UNAUTHORIZED\"");
	}

	@Test
	void passwordResetChangesPasswordRevokesSessionsAndConsumesToken() throws Exception {
		String email = "reset-" + UUID.randomUUID() + "@example.com";
		HttpResponse<String> signupResponse = signup(email, "password123!");
		String oldRefreshToken = objectMapper.readTree(signupResponse.body()).path("data").path("refreshToken").asText();

		HttpResponse<String> requestResponse = post(
				"/api/v1/auth/password/reset-request",
				"{\"email\":\"" + email + "\"}"
		);
		assertThat(requestResponse.statusCode()).isEqualTo(202);

		ArgumentCaptor<String> tokenCaptor = ArgumentCaptor.forClass(String.class);
		verify(passwordResetMailSender).send(eq(email), tokenCaptor.capture());
		String resetToken = tokenCaptor.getValue();

		assertThat(resetPassword(resetToken, "newPassword123!").statusCode()).isEqualTo(200);
		assertThat(login(email, "password123!").statusCode()).isEqualTo(401);
		assertThat(login(email, "newPassword123!").statusCode()).isEqualTo(200);
		assertThat(post(
				"/api/v1/auth/refresh",
				"{\"refreshToken\":\"" + oldRefreshToken + "\"}"
		).statusCode()).isEqualTo(401);

		HttpResponse<String> reusedTokenResponse = resetPassword(resetToken, "anotherPassword123!");
		assertThat(reusedTokenResponse.statusCode()).isEqualTo(400);
		assertThat(reusedTokenResponse.body()).contains("\"code\":\"INVALID_PASSWORD_RESET_TOKEN\"");
	}

	@Test
	void passwordResetRequestDoesNotRevealAccountExistence() throws Exception {
		String email = "known-" + UUID.randomUUID() + "@example.com";
		signup(email, "password123!");

		HttpResponse<String> knownResponse = post(
				"/api/v1/auth/password/reset-request",
				"{\"email\":\"" + email + "\"}"
		);
		clearInvocations(passwordResetMailSender);
		HttpResponse<String> unknownResponse = post(
				"/api/v1/auth/password/reset-request",
				"{\"email\":\"unknown-" + UUID.randomUUID() + "@example.com\"}"
		);

		assertThat(knownResponse.statusCode()).isEqualTo(202);
		assertThat(unknownResponse.statusCode()).isEqualTo(202);
		assertThat(unknownResponse.body()).isEqualTo(knownResponse.body());
		verifyNoInteractions(passwordResetMailSender);
	}

	@Test
	void expiredPasswordResetTokenCannotBeUsed() throws Exception {
		String email = "expired-" + UUID.randomUUID() + "@example.com";
		signup(email, "password123!");
		User user = userRepository.findByEmail(email).orElseThrow();
		String rawToken = "expired-reset-token";
		passwordResetTokenRepository.save(new PasswordResetToken(
				user,
				hash(rawToken),
				LocalDateTime.now().minusSeconds(1)
		));

		HttpResponse<String> response = resetPassword(rawToken, "newPassword123!");

		assertThat(response.statusCode()).isEqualTo(400);
		assertThat(response.body()).contains("\"code\":\"INVALID_PASSWORD_RESET_TOKEN\"");
	}

	@Test
	void authenticatedUserCanWithdrawAndAllSessionsBecomeInvalid() throws Exception {
		String email = "withdraw-" + UUID.randomUUID() + "@example.com";
		HttpResponse<String> signupResponse = signup(email, "password123!");
		JsonNode tokenData = objectMapper.readTree(signupResponse.body()).path("data");
		String accessToken = tokenData.path("accessToken").asText();
		String refreshToken = tokenData.path("refreshToken").asText();

		HttpResponse<String> wrongPasswordResponse = delete(
				"/api/v1/auth/account",
				"{\"password\":\"wrongPassword123!\"}",
				accessToken
		);
		assertThat(wrongPasswordResponse.statusCode()).isEqualTo(401);
		assertThat(get("/api/v1/users/me", accessToken).statusCode()).isEqualTo(200);

		HttpResponse<String> withdrawResponse = delete(
				"/api/v1/auth/account",
				"{\"password\":\"password123!\"}",
				accessToken
		);
		assertThat(withdrawResponse.statusCode()).isEqualTo(200);

		User withdrawnUser = userRepository.findByEmail(email).orElseThrow();
		assertThat(withdrawnUser.getAccountStatus().name()).isEqualTo("WITHDRAWN");
		assertThat(withdrawnUser.getWithdrawnAt()).isNotNull();
		assertThat(login(email, "password123!").statusCode()).isEqualTo(403);
		assertThat(get("/api/v1/users/me", accessToken).statusCode()).isEqualTo(403);
		assertThat(post(
				"/api/v1/auth/refresh",
				"{\"refreshToken\":\"" + refreshToken + "\"}"
		).statusCode()).isEqualTo(401);
	}

	private HttpResponse<String> signup(String email, String password) throws Exception {
		String body = """
				{
				  "email": "%s",
				  "password": "%s",
				  "realName": "홍길동",
				  "phoneNumber": "010-1234-5678",
				  "birthDate": "1995-01-01"
				}
				""".formatted(email, password);
		return post("/api/v1/auth/signup", body);
	}

	private HttpResponse<String> login(String email, String password) throws Exception {
		return post(
				"/api/v1/auth/login",
				"{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"
		);
	}

	private HttpResponse<String> resetPassword(String token, String newPassword) throws Exception {
		return patch(
				"/api/v1/auth/password/reset",
				"{\"token\":\"" + token + "\",\"newPassword\":\"" + newPassword + "\"}"
		);
	}

	private String hash(String value) throws Exception {
		byte[] digest = MessageDigest.getInstance("SHA-256")
				.digest(value.getBytes(StandardCharsets.UTF_8));
		return HexFormat.of().formatHex(digest);
	}

	private HttpResponse<String> get(String path) throws Exception {
		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create("http://localhost:" + port + path))
				.GET()
				.build();

		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

	private HttpResponse<String> get(String path, String accessToken) throws Exception {
		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create("http://localhost:" + port + path))
				.header("Authorization", "Bearer " + accessToken)
				.GET()
				.build();

		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

	private HttpResponse<String> post(String path, String body) throws Exception {
		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create("http://localhost:" + port + path))
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(body))
				.build();

		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

	private HttpResponse<String> patch(String path, String body) throws Exception {
		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create("http://localhost:" + port + path))
				.header("Content-Type", "application/json")
				.method("PATCH", HttpRequest.BodyPublishers.ofString(body))
				.build();

		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

	private HttpResponse<String> delete(String path, String body, String accessToken) throws Exception {
		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create("http://localhost:" + port + path))
				.header("Content-Type", "application/json")
				.header("Authorization", "Bearer " + accessToken)
				.method("DELETE", HttpRequest.BodyPublishers.ofString(body))
				.build();

		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

}
