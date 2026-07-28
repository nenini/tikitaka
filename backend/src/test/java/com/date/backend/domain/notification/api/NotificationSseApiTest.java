package com.date.backend.domain.notification.api;

import com.date.backend.domain.auth.oauth.OAuthClient;
import com.date.backend.domain.auth.password.PasswordResetMailSender;
import com.date.backend.domain.notification.application.NotificationCreationService;
import com.date.backend.domain.notification.application.NotificationSseService;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
		webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = {
				"spring.datasource.url=jdbc:h2:mem:notification-sse-api-test;"
						+ "MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
				"spring.flyway.enabled=true",
				"spring.flyway.baseline-on-migrate=false",
				"spring.jpa.hibernate.ddl-auto=validate",
				"notification.sse.enabled=false",
				"notification.sse.timeout-ms=3000"
		}
)
@ActiveProfiles("test")
class NotificationSseApiTest {

	@LocalServerPort
	private int port;

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private NotificationCreationService notificationCreationService;

	@Autowired
	private NotificationSseService notificationSseService;

	@MockitoBean
	private PasswordResetMailSender passwordResetMailSender;

	@MockitoBean
	private OAuthClient oauthClient;

	@Test
	@Timeout(value = 30, unit = TimeUnit.SECONDS)
	void authenticatedSubscriberReceivesCommittedNotification() throws Exception {
		String email = "notification-sse-"
				+ UUID.randomUUID() + "@example.com";
		String accessToken = signup(email);
		User user = userRepository.findByEmail(email).orElseThrow();
		HttpRequest subscribeRequest = HttpRequest.newBuilder(
						uri("/api/v1/notifications/subscribe")
				)
				.header("Authorization", "Bearer " + accessToken)
				.header("Accept", "text/event-stream")
				.GET()
				.build();

		HttpResponse<InputStream> response = HttpClient.newHttpClient().send(
				subscribeRequest,
				HttpResponse.BodyHandlers.ofInputStream()
		);

		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.headers().firstValue("Content-Type").orElse(""))
				.startsWith("text/event-stream");
		assertThat(response.headers().firstValue("X-Accel-Buffering"))
				.contains("no");
		try (
				InputStream inputStream = response.body();
				BufferedReader reader = new BufferedReader(new InputStreamReader(
						inputStream,
						StandardCharsets.UTF_8
				))
		) {
			assertThat(readEvent(reader))
					.contains("event:connected")
					.contains("\"userId\":" + user.getId());

			notificationCreationService.create(
					user.getId(),
					NotificationType.MATCH_FOUND,
					"새로운 매칭",
					"새로운 매칭이 성립되었습니다.",
					NotificationReferenceType.MATCH_PAIR,
					200L,
					NotificationPresentation.BELL_AND_TOAST,
					"MATCH_FOUND:200:" + user.getId()
			);

			assertThat(readEvent(reader))
					.contains("event:notification")
					.contains("\"type\":\"MATCH_FOUND\"")
					.contains("\"title\":\"새로운 매칭\"")
					.contains("\"referenceId\":200");
		} finally {
			notificationSseService.disconnect(user.getId());
		}
	}

	@Test
	void subscriptionRequiresAuthentication() throws Exception {
		HttpRequest request = HttpRequest.newBuilder(
						uri("/api/v1/notifications/subscribe")
				)
				.header("Accept", "text/event-stream")
				.GET()
				.build();

		HttpResponse<String> response = HttpClient.newHttpClient().send(
				request,
				HttpResponse.BodyHandlers.ofString()
		);

		assertThat(response.statusCode()).isEqualTo(401);
		assertThat(response.body()).contains("\"code\":\"UNAUTHORIZED\"");
	}

	private String readEvent(BufferedReader reader) throws Exception {
		List<String> lines = new ArrayList<>();
		String line;
		while ((line = reader.readLine()) != null) {
			if (line.isEmpty()) {
				break;
			}
			lines.add(line);
		}
		return String.join("\n", lines);
	}

	private String signup(String email) throws Exception {
		HttpRequest request = HttpRequest.newBuilder(uri("/api/v1/auth/signup"))
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString("""
						{
						  "email": "%s",
						  "password": "password123!",
						  "realName": "SSE 사용자",
						  "phoneNumber": "010-1234-5678",
						  "birthDate": "1995-01-01"
						}
						""".formatted(email)))
				.build();
		HttpResponse<String> response = HttpClient.newHttpClient().send(
				request,
				HttpResponse.BodyHandlers.ofString()
		);
		assertThat(response.statusCode()).isEqualTo(201);
		return objectMapper.readTree(response.body())
				.path("data")
				.path("accessToken")
				.asText();
	}

	private URI uri(String path) {
		return URI.create("http://localhost:" + port + path);
	}
}
