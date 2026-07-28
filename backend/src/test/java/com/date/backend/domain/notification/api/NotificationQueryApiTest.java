package com.date.backend.domain.notification.api;

import com.date.backend.domain.auth.oauth.OAuthClient;
import com.date.backend.domain.auth.password.PasswordResetMailSender;
import com.date.backend.domain.notification.domain.Notification;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.repository.NotificationRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
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
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
		webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = {
				"spring.datasource.url=jdbc:h2:mem:notification-query-api-test;"
						+ "MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
				"spring.flyway.enabled=true",
				"spring.flyway.baseline-on-migrate=false",
				"spring.jpa.hibernate.ddl-auto=validate"
		}
)
@ActiveProfiles("test")
class NotificationQueryApiTest {

	@LocalServerPort
	private int port;

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private NotificationRepository notificationRepository;

	@MockitoBean
	private PasswordResetMailSender passwordResetMailSender;

	@MockitoBean
	private OAuthClient oauthClient;

	@Test
	void authenticatedUserCanReadCursorPageAndUnreadCount() throws Exception {
		String email = "notification-" + UUID.randomUUID() + "@example.com";
		HttpResponse<String> signupResponse = post(
				"/api/v1/auth/signup",
				"""
						{
						  "email": "%s",
						  "password": "password123!",
						  "realName": "알림 사용자",
						  "phoneNumber": "010-1234-5678",
						  "birthDate": "1995-01-01"
						}
						""".formatted(email)
		);
		assertThat(signupResponse.statusCode()).isEqualTo(201);
		String accessToken = objectMapper.readTree(signupResponse.body())
				.path("data")
				.path("accessToken")
				.asText();
		User user = userRepository.findByEmail(email).orElseThrow();
		Notification first = saveNotification(user.getId(), 1L);
		first.read(LocalDateTime.of(2026, 7, 28, 10, 0));
		notificationRepository.save(first);
		Notification second = saveNotification(user.getId(), 2L);
		Notification third = saveNotification(user.getId(), 3L);

		HttpResponse<String> firstPageResponse = get(
				"/api/v1/notifications?size=2",
				accessToken
		);

		assertThat(firstPageResponse.statusCode()).isEqualTo(200);
		JsonNode firstPage = objectMapper.readTree(firstPageResponse.body())
				.path("data");
		assertThat(firstPage.path("notifications").size()).isEqualTo(2);
		assertThat(firstPage.path("notifications").get(0)
				.path("notificationId").asLong()).isEqualTo(third.getId());
		assertThat(firstPage.path("notifications").get(1)
				.path("notificationId").asLong()).isEqualTo(second.getId());
		assertThat(firstPage.path("hasNext").asBoolean()).isTrue();
		long nextCursor = firstPage.path("nextCursor").asLong();

		HttpResponse<String> secondPageResponse = get(
				"/api/v1/notifications?cursor=" + nextCursor + "&size=2",
				accessToken
		);
		JsonNode secondPage = objectMapper.readTree(secondPageResponse.body())
				.path("data");
		assertThat(secondPage.path("notifications").size()).isEqualTo(1);
		assertThat(secondPage.path("notifications").get(0)
				.path("notificationId").asLong()).isEqualTo(first.getId());
		assertThat(secondPage.path("hasNext").asBoolean()).isFalse();
		assertThat(secondPage.path("nextCursor").isNull()).isTrue();

		HttpResponse<String> countResponse = get(
				"/api/v1/notifications/unread-count",
				accessToken
		);
		assertThat(countResponse.statusCode()).isEqualTo(200);
		assertThat(objectMapper.readTree(countResponse.body())
				.path("data")
				.path("unreadCount")
				.asLong()).isEqualTo(2);
	}

	@Test
	void notificationEndpointsRequireAuthentication() throws Exception {
		assertThat(get("/api/v1/notifications?size=20", null).statusCode())
				.isEqualTo(401);
		assertThat(get("/api/v1/notifications/unread-count", null).statusCode())
				.isEqualTo(401);
		assertThat(patch("/api/v1/notifications/1/read", null).statusCode())
				.isEqualTo(401);
		assertThat(patch("/api/v1/notifications/read-all", null).statusCode())
				.isEqualTo(401);
	}

	@Test
	void userCanReadOwnNotificationIdempotentlyAndReadAll() throws Exception {
		String ownerEmail = "notification-owner-"
				+ UUID.randomUUID() + "@example.com";
		String ownerToken = signup(ownerEmail);
		User owner = userRepository.findByEmail(ownerEmail).orElseThrow();
		Notification first = saveNotification(owner.getId(), 101L);

		HttpResponse<String> firstReadResponse = patch(
				"/api/v1/notifications/" + first.getId() + "/read",
				ownerToken
		);

		assertThat(firstReadResponse.statusCode()).isEqualTo(200);
		JsonNode firstReadData = objectMapper.readTree(firstReadResponse.body())
				.path("data");
		assertThat(firstReadData.path("read").asBoolean()).isTrue();
		String firstReadAt = firstReadData.path("readAt").asText();
		assertThat(firstReadAt).isNotBlank();

		HttpResponse<String> repeatedReadResponse = patch(
				"/api/v1/notifications/" + first.getId() + "/read",
				ownerToken
		);
		assertThat(objectMapper.readTree(repeatedReadResponse.body())
				.path("data")
				.path("readAt")
				.asText()).isEqualTo(firstReadAt);

		String otherEmail = "notification-other-"
				+ UUID.randomUUID() + "@example.com";
		String otherToken = signup(otherEmail);
		HttpResponse<String> forbiddenReadResponse = patch(
				"/api/v1/notifications/" + first.getId() + "/read",
				otherToken
		);
		assertThat(forbiddenReadResponse.statusCode()).isEqualTo(404);
		assertThat(forbiddenReadResponse.body())
				.contains("\"code\":\"NOTIFICATION_NOT_FOUND\"");

		saveNotification(owner.getId(), 102L);
		saveNotification(owner.getId(), 103L);
		HttpResponse<String> readAllResponse = patch(
				"/api/v1/notifications/read-all",
				ownerToken
		);
		assertThat(readAllResponse.statusCode()).isEqualTo(200);
		JsonNode readAllData = objectMapper.readTree(readAllResponse.body())
				.path("data");
		assertThat(readAllData.path("updatedCount").asInt()).isEqualTo(2);
		assertThat(readAllData.path("readAt").asText()).isNotBlank();

		HttpResponse<String> repeatedReadAllResponse = patch(
				"/api/v1/notifications/read-all",
				ownerToken
		);
		assertThat(objectMapper.readTree(repeatedReadAllResponse.body())
				.path("data")
				.path("updatedCount")
				.asInt()).isZero();
		assertThat(objectMapper.readTree(get(
				"/api/v1/notifications/unread-count",
				ownerToken
		).body()).path("data").path("unreadCount").asLong()).isZero();
	}

	private Notification saveNotification(Long userId, Long pairId) {
		return notificationRepository.save(new Notification(
				userId,
				NotificationType.MATCH_FOUND,
				"새로운 매칭",
				"새로운 매칭이 성립되었습니다.",
				NotificationReferenceType.MATCH_PAIR,
				pairId,
				NotificationPresentation.BELL_AND_TOAST,
				"MATCH_FOUND:" + pairId + ":" + userId
		));
	}

	private HttpResponse<String> post(String path, String body) throws Exception {
		HttpRequest request = HttpRequest.newBuilder(uri(path))
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(body))
				.build();
		return HttpClient.newHttpClient().send(
				request,
				HttpResponse.BodyHandlers.ofString()
		);
	}

	private String signup(String email) throws Exception {
		HttpResponse<String> response = post(
				"/api/v1/auth/signup",
				"""
						{
						  "email": "%s",
						  "password": "password123!",
						  "realName": "알림 사용자",
						  "phoneNumber": "010-1234-5678",
						  "birthDate": "1995-01-01"
						}
						""".formatted(email)
		);
		assertThat(response.statusCode()).isEqualTo(201);
		return objectMapper.readTree(response.body())
				.path("data")
				.path("accessToken")
				.asText();
	}

	private HttpResponse<String> get(String path, String token) throws Exception {
		HttpRequest.Builder builder = HttpRequest.newBuilder(uri(path)).GET();
		if (token != null) {
			builder.header("Authorization", "Bearer " + token);
		}
		return HttpClient.newHttpClient().send(
				builder.build(),
				HttpResponse.BodyHandlers.ofString()
		);
	}

	private HttpResponse<String> patch(String path, String token) throws Exception {
		HttpRequest.Builder builder = HttpRequest.newBuilder(uri(path))
				.method("PATCH", HttpRequest.BodyPublishers.noBody());
		if (token != null) {
			builder.header("Authorization", "Bearer " + token);
		}
		return HttpClient.newHttpClient().send(
				builder.build(),
				HttpResponse.BodyHandlers.ofString()
		);
	}

	private URI uri(String path) {
		return URI.create("http://localhost:" + port + path);
	}
}
