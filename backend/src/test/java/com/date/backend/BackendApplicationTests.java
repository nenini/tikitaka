package com.date.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class BackendApplicationTests {
	@LocalServerPort
	private int port;

	@Autowired
	private ObjectMapper objectMapper;

	@Test
	void contextLoads() {
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
		assertThat(response.body()).contains("\"title\":\"Backend API\"");
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

}
