package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.ActiveMatchRequest;
import com.date.backend.domain.match.domain.MatchJobStatus;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchJobRepository;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.match.repository.MatchRequestSlotRepository;
import com.date.backend.domain.match.repository.MatchResponseRepository;
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:match-job-population-concurrency-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate",
		"match.scheduler.enabled=false",
		"match.worker.enabled=false",
		"match.worker.batch-size=20"
})
@ActiveProfiles("test")
class MatchJobPopulationConcurrencyTest {

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ProfileRepository profileRepository;

	@Autowired
	private FaceTagCatalogRepository faceTagRepository;

	@Autowired
	private MatchRequestRepository requestRepository;

	@Autowired
	private ActiveMatchRequestRepository activeRequestRepository;

	@Autowired
	private MatchRequestSlotRepository slotRepository;

	@Autowired
	private MatchJobRepository jobRepository;

	@Autowired
	private MatchPairRepository pairRepository;

	@Autowired
	private MatchResponseRepository responseRepository;

	@Autowired
	private MatchJobEnqueueService enqueueService;

	@Autowired
	private MatchJobClaimService claimService;

	@Autowired
	private MatchJobProcessor processor;

	@Autowired
	private MatchJobFailureService failureService;

	@Test
	void concurrentWorkersMatchMultipleUsersWithoutDuplicateAssignment() throws Exception {
		FaceTagCatalog faceTag = faceTagRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc()
				.get(0);
		int referenceYear = LocalDate.now().getYear();
		for (int age = 24; age <= 27; age++) {
			saveApplicant("concurrent-male-" + age, Gender.MALE, age, referenceYear, faceTag);
			saveApplicant(
					"concurrent-female-" + age,
					Gender.FEMALE,
					age,
					referenceYear,
					faceTag
			);
		}

		String workerId = "population-concurrency-worker";
		List<ClaimedMatchJob> claimedJobs = claimService.claim(
				workerId,
				LocalDateTime.now().plusSeconds(1)
		);
		assertThat(claimedJobs).hasSize(8);

		ExecutorService executor = Executors.newFixedThreadPool(4);
		try {
			List<? extends Future<?>> futures = claimedJobs.stream()
					.map(job -> executor.submit(
							() -> processLikeWorker(job, workerId)
					))
					.toList();
			for (Future<?> future : futures) {
				future.get(30, TimeUnit.SECONDS);
			}
		} finally {
			executor.shutdownNow();
		}

		processRetriedJobs();

		Set<Long> matchedUserIds = new HashSet<>();
		assertThat(pairRepository.findAll())
				.hasSize(4)
				.allSatisfy(pair -> {
					assertThat(matchedUserIds.add(pair.getUserAId())).isTrue();
					assertThat(matchedUserIds.add(pair.getUserBId())).isTrue();
				});
		assertThat(matchedUserIds).hasSize(8);
		assertThat(responseRepository.count()).isEqualTo(8);
		assertThat(jobRepository.findAll())
				.hasSize(8)
				.allMatch(job -> job.getStatus() == MatchJobStatus.COMPLETED);
	}

	private void processLikeWorker(ClaimedMatchJob job, String workerId) {
		try {
			processor.process(job.jobId(), workerId);
		} catch (Exception exception) {
			failureService.fail(
					job.jobId(),
					workerId,
					exception.getMessage(),
					LocalDateTime.now()
			);
		}
	}

	private void processRetriedJobs() {
		String workerId = "population-retry-worker";
		while (true) {
			List<ClaimedMatchJob> claimed = claimService.claim(
					workerId,
					LocalDateTime.now().plusHours(1)
			);
			if (claimed.isEmpty()) {
				return;
			}
			claimed.forEach(job -> processor.process(job.jobId(), workerId));
		}
	}

	private void saveApplicant(
			String key,
			Gender gender,
			int koreanAge,
			int referenceYear,
			FaceTagCatalog faceTag
	) {
		int sequence = Math.abs(key.hashCode() % 1_000_000);
		User user = userRepository.save(new User(
				key + "@example.com",
				"password",
				key,
				"011" + String.format("%08d", sequence),
				LocalDate.of(referenceYear - koreanAge + 1, 12, 31)
		));
		profileRepository.save(new Profile(user.getId(), key, gender, "서울"));
		MatchRequest request = requestRepository.save(new MatchRequest(
				user.getId(),
				(short) koreanAge,
				(short) koreanAge,
				faceTag,
				faceTag
		));
		activeRequestRepository.save(new ActiveMatchRequest(user.getId(), request));
		slotRepository.save(new MatchRequestSlot(
				request,
				DayOfWeek.TUESDAY,
				LocalTime.of(19, 0),
				LocalTime.of(22, 0)
		));
		enqueueService.enqueue(request);
	}
}
