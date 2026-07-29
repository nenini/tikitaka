package com.date.backend.domain.notification.application;

import com.date.backend.domain.match.domain.ActiveMatchRequest;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.notification.domain.NotificationJob;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.repository.NotificationJobRepository;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:waiting-recommendation-test;"
				+ "MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate",
		"match.policy.setting-recommendation-delay-seconds=86400"
})
@ActiveProfiles("test")
@Transactional
class MatchWaitingRecommendationNotificationIntegrationTest {

	@Autowired
	private MatchWaitingRecommendationNotificationService service;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private FaceTagCatalogRepository faceTagCatalogRepository;

	@Autowired
	private MatchRequestRepository matchRequestRepository;

	@Autowired
	private ActiveMatchRequestRepository activeMatchRequestRepository;

	@Autowired
	private NotificationJobRepository notificationJobRepository;

	@Test
	void schedulesOncePerWaitingPeriodAndAgainAfterReturningToWaiting() {
		LocalDateTime now = LocalDateTime.of(2026, 7, 28, 14, 0);
		User user = userRepository.save(new User(
				"waiting-recommendation@example.com",
				"password-hash",
				"장기 대기 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		FaceTagCatalog faceTag = faceTagCatalogRepository.findAll().get(0);
		MatchRequest request = matchRequestRepository.save(new MatchRequest(
				user.getId(),
				(short) 20,
				(short) 40,
				faceTag,
				faceTag,
				now.minusHours(24)
		));
		activeMatchRequestRepository.save(new ActiveMatchRequest(
				user.getId(),
				request
		));

		assertThat(service.scheduleDue(now)).isEqualTo(1);
		assertThat(service.scheduleDue(now.plusMinutes(1))).isZero();
		assertThat(notificationJobRepository.findAll())
				.singleElement()
				.satisfies(job -> {
					assertThat(job.getType()).isEqualTo(
							NotificationType.MATCH_SETTING_RECOMMENDED
					);
					assertThat(job.getReferenceId()).isEqualTo(request.getId());
					assertThat(job.getScheduledAt()).isEqualTo(now);
				});
		assertThat(request.getSettingRecommendationSentAt()).isEqualTo(now);

		LocalDateTime secondWaitingStartedAt = now.plusHours(2);
		request.markMatchFound(now.plusHours(1));
		request.returnToWaiting(secondWaitingStartedAt);

		assertThat(service.scheduleDue(now.plusHours(26))).isEqualTo(1);
		assertThat(notificationJobRepository.findAll())
				.hasSize(2)
				.extracting(NotificationJob::getDeduplicationKey)
				.doesNotHaveDuplicates();
		assertThat(request.getSettingRecommendationSentAt())
				.isEqualTo(now.plusHours(26));
	}
}
