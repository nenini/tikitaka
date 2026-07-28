package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchJob;
import com.date.backend.domain.match.domain.MatchJobStatus;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.repository.MatchJobRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:match-job-recovery-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate",
		"match.scheduler.enabled=false",
		"match.worker.enabled=false"
})
@ActiveProfiles("test")
class MatchJobRecoveryIntegrationTest {

	@Autowired
	private MatchJobRecoveryService recoveryService;

	@Autowired
	private MatchJobRepository jobRepository;

	@Autowired
	private MatchRequestRepository requestRepository;

	@Autowired
	private FaceTagCatalogRepository faceTagRepository;

	@Autowired
	private UserRepository userRepository;

	@Test
	void recoversProcessingJobWhoseWorkerStopped() {
		User user = userRepository.save(new User(
				"match-job-recovery@example.com",
				"password",
				"복구 사용자",
				"01012345678",
				LocalDate.of(2000, 1, 1)
		));
		List<FaceTagCatalog> faceTags =
				faceTagRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		MatchRequest request = requestRepository.save(new MatchRequest(
				user.getId(),
				(short) 20,
				(short) 40,
				faceTags.get(0),
				faceTags.get(0)
		));
		LocalDateTime claimedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		MatchJob job = new MatchJob(request, claimedAt.minusSeconds(1));
		job.claim("stopped-worker", claimedAt);
		job = jobRepository.saveAndFlush(job);

		recoveryService.recoverStale(claimedAt.plusSeconds(61));

		MatchJob recovered = jobRepository.findById(job.getId()).orElseThrow();
		assertThat(recovered.getStatus()).isEqualTo(MatchJobStatus.PENDING);
		assertThat(recovered.getAttemptCount()).isEqualTo(1);
		assertThat(recovered.getWorkerId()).isNull();
		assertThat(recovered.getClaimedAt()).isNull();
		assertThat(recovered.getAvailableAt())
				.isEqualTo(claimedAt.plusSeconds(66));
		assertThat(recovered.getLastError()).contains("복구");
	}
}
