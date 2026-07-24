package com.date.backend.domain.face.api;

import com.date.backend.domain.auth.oauth.OAuthClient;
import com.date.backend.domain.auth.password.PasswordResetMailSender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
		webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = {
				"spring.datasource.url=jdbc:h2:mem:face-analysis-result-api-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
				"spring.flyway.enabled=true",
				"spring.flyway.baseline-on-migrate=false",
				"spring.jpa.hibernate.ddl-auto=validate"
		}
)
@ActiveProfiles("test")
class FaceAnalysisResultApiTest {

	@LocalServerPort
	private int port;

	@Autowired
	private ObjectMapper objectMapper;

	@MockitoBean
	private PasswordResetMailSender passwordResetMailSender;

	@MockitoBean
	private OAuthClient oauthClient;

	@Test
	void authenticatedUserCanSubmitFaceAnalysisResultOnlyOnce() throws Exception {
		String uniqueValue = UUID.randomUUID().toString();
		HttpResponse<String> signupResponse = post(
				"/api/v1/auth/signup",
				"""
						{
						  "email": "face-result-%s@example.com",
						  "password": "password123!",
						  "realName": "테스트 사용자",
						  "phoneNumber": "010-1234-5678",
						  "birthDate": "1995-01-01"
						}
						""".formatted(uniqueValue)
		);
		assertThat(signupResponse.statusCode()).isEqualTo(201);
		String accessToken = objectMapper.readTree(signupResponse.body())
				.path("data")
				.path("accessToken")
				.asText();

		HttpResponse<String> profileResponse = post(
				"/api/v1/users/me/profile",
				"""
						{
						  "nickname": "얼굴%s",
						  "gender": "MALE",
						  "regionCity": "서울"
						}
						""".formatted(uniqueValue.substring(0, 8)),
				accessToken
		);
		assertThat(profileResponse.statusCode()).isEqualTo(201);

		HttpResponse<String> emptyResultResponse = get(
				"/api/v1/users/me/face-analysis",
				accessToken
		);
		assertThat(emptyResultResponse.statusCode()).isEqualTo(404);
		assertThat(emptyResultResponse.body())
				.contains("\"code\":\"FACE_ANALYSIS_RESULT_NOT_FOUND\"");

		HttpResponse<String> requestResponse = post(
				"/api/v1/face-analyses",
				"{}",
				accessToken
		);
		assertThat(requestResponse.statusCode()).isEqualTo(201);
		long analysisRequestId = objectMapper.readTree(requestResponse.body())
				.path("data")
				.path("analysisRequestId")
				.asLong();
		String resultBody = """
				{
				  "modelVersion": "face-type-facenet-geometry-v3-experimental",
				  "tags": [
				    {
				      "code": "DOG",
				      "rank": 1,
				      "relativeScore": 0.700000
				    },
				    {
				      "code": "CAT",
				      "rank": 2,
				      "relativeScore": 0.300000
				    }
				  ]
				}
				""";

		HttpResponse<String> resultResponse = post(
				"/api/v1/face-analyses/" + analysisRequestId + "/result",
				resultBody,
				accessToken
		);

		assertThat(resultResponse.statusCode())
				.withFailMessage("Unexpected face analysis result response: %s", resultResponse.body())
				.isEqualTo(201);
		JsonNode resultData = objectMapper.readTree(resultResponse.body()).path("data");
		assertThat(resultData.path("analysisRequestId").asLong()).isEqualTo(analysisRequestId);
		assertThat(resultData.path("status").asText()).isEqualTo("COMPLETED");
		assertThat(resultData.path("primaryType").asText()).isEqualTo("DOG");
		assertThat(resultData.path("primaryTypeDisplayName").asText())
				.isEqualTo("강아지상");
		assertThat(resultData.path("tags")).hasSize(2);
		assertThat(resultData.path("tags").get(0).path("displayName").asText())
				.isEqualTo("강아지상");

		HttpResponse<String> latestResultResponse = get(
				"/api/v1/users/me/face-analysis",
				accessToken
		);
		assertThat(latestResultResponse.statusCode()).isEqualTo(200);
		JsonNode latestResultData =
				objectMapper.readTree(latestResultResponse.body()).path("data");
		assertThat(latestResultData.path("analysisRequestId").asLong())
				.isEqualTo(analysisRequestId);
		assertThat(latestResultData.path("status").asText()).isEqualTo("COMPLETED");
		assertThat(latestResultData.path("primaryType").asText()).isEqualTo("DOG");
		assertThat(latestResultData.path("primaryTypeDisplayName").asText())
				.isEqualTo("강아지상");
		assertThat(latestResultData.path("tags")).hasSize(2);
		assertThat(latestResultData.path("tags").get(0).path("displayName").asText())
				.isEqualTo("강아지상");

		HttpResponse<String> duplicateResponse = post(
				"/api/v1/face-analyses/" + analysisRequestId + "/result",
				resultBody,
				accessToken
		);
		assertThat(duplicateResponse.statusCode()).isEqualTo(409);
		assertThat(duplicateResponse.body())
				.contains("\"code\":\"FACE_ANALYSIS_REQUEST_NOT_PENDING\"");
	}

	@Test
	void authenticatedUserCanSubmitFaceAnalysisFailureOnlyOnce() throws Exception {
		String uniqueValue = UUID.randomUUID().toString();
		HttpResponse<String> signupResponse = post(
				"/api/v1/auth/signup",
				"""
						{
						  "email": "face-failure-%s@example.com",
						  "password": "password123!",
						  "realName": "실패 테스트 사용자",
						  "phoneNumber": "010-5678-1234",
						  "birthDate": "1995-01-01"
						}
						""".formatted(uniqueValue)
		);
		assertThat(signupResponse.statusCode()).isEqualTo(201);
		String accessToken = objectMapper.readTree(signupResponse.body())
				.path("data")
				.path("accessToken")
				.asText();

		HttpResponse<String> requestResponse = post(
				"/api/v1/face-analyses",
				"{}",
				accessToken
		);
		assertThat(requestResponse.statusCode()).isEqualTo(201);
		long analysisRequestId = objectMapper.readTree(requestResponse.body())
				.path("data")
				.path("analysisRequestId")
				.asLong();
		String failureBody = """
				{
				  "failureCode": "NO_FACE"
				}
				""";

		HttpResponse<String> failureResponse = post(
				"/api/v1/face-analyses/" + analysisRequestId + "/failure",
				failureBody,
				accessToken
		);

		assertThat(failureResponse.statusCode()).isEqualTo(200);
		JsonNode failureData =
				objectMapper.readTree(failureResponse.body()).path("data");
		assertThat(failureData.path("analysisRequestId").asLong())
				.isEqualTo(analysisRequestId);
		assertThat(failureData.path("status").asText()).isEqualTo("FAILED");
		assertThat(failureData.path("failureCode").asText()).isEqualTo("NO_FACE");
		assertThat(failureData.path("failedAt").asText()).isNotBlank();

		HttpResponse<String> duplicateResponse = post(
				"/api/v1/face-analyses/" + analysisRequestId + "/failure",
				failureBody,
				accessToken
		);
		assertThat(duplicateResponse.statusCode()).isEqualTo(409);
		assertThat(duplicateResponse.body())
				.contains("\"code\":\"FACE_ANALYSIS_REQUEST_NOT_PENDING\"");
	}

	private HttpResponse<String> post(String path, String body) throws Exception {
		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create("http://localhost:" + port + path))
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(body))
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

	private HttpResponse<String> post(String path, String body, String accessToken) throws Exception {
		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create("http://localhost:" + port + path))
				.header("Content-Type", "application/json")
				.header("Authorization", "Bearer " + accessToken)
				.POST(HttpRequest.BodyPublishers.ofString(body))
				.build();

		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}
}
