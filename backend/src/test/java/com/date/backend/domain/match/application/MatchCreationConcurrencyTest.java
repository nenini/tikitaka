package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.ActiveMatchRequest;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
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
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:match-creation-concurrency-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate",
		"match.scheduler.enabled=false"
})
@ActiveProfiles("test")
class MatchCreationConcurrencyTest {

	@Autowired
	private MatchCreationService creationService;

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
	private MatchPairRepository pairRepository;

	@Autowired
	private MatchResponseRepository responseRepository;

	@Test
	void concurrentCreationPersistsOnlyOnePairForSameRequests() throws Exception {
		User firstUser = userRepository.save(new User(
				"match-concurrency-a@example.com",
				"password",
				"사용자A",
				"01011112222",
				LocalDate.of(2000, 1, 1)
		));
		User secondUser = userRepository.save(new User(
				"match-concurrency-b@example.com",
				"password",
				"사용자B",
				"01033334444",
				LocalDate.of(2000, 2, 1)
		));
		profileRepository.saveAllAndFlush(List.of(
				new Profile(firstUser.getId(), "동시성남성", Gender.MALE, "서울"),
				new Profile(secondUser.getId(), "동시성여성", Gender.FEMALE, "서울")
		));
		List<FaceTagCatalog> faceTags =
				faceTagRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		MatchRequest firstRequest = requestRepository.save(new MatchRequest(
				firstUser.getId(),
				(short) 20,
				(short) 40,
				faceTags.get(0),
				faceTags.get(0)
		));
		MatchRequest secondRequest = requestRepository.save(new MatchRequest(
				secondUser.getId(),
				(short) 20,
				(short) 40,
				faceTags.get(0),
				faceTags.get(0)
		));
		activeRequestRepository.saveAllAndFlush(List.of(
				new ActiveMatchRequest(firstUser.getId(), firstRequest),
				new ActiveMatchRequest(secondUser.getId(), secondRequest)
		));
		slotRepository.saveAllAndFlush(List.of(
				new MatchRequestSlot(
						firstRequest,
						DayOfWeek.MONDAY,
						LocalTime.of(19, 0),
						LocalTime.of(22, 0)
				),
				new MatchRequestSlot(
						secondRequest,
						DayOfWeek.MONDAY,
						LocalTime.of(19, 0),
						LocalTime.of(22, 0)
				)
		));

		LocalDateTime matchedAt = LocalDateTime.of(2026, 7, 27, 10, 0);
		LocalDateTime deadline = matchedAt.plusMinutes(5);
		LocalDateTime earliestSessionStart = matchedAt.withHour(20);
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);
		Callable<Boolean> task = () -> {
			ready.countDown();
			start.await();
			return creationService.createMatch(
					firstRequest.getId(),
					secondRequest.getId(),
					matchedAt,
					deadline,
					earliestSessionStart
			);
		};

		ExecutorService executor = Executors.newFixedThreadPool(2);
		try {
			Future<Boolean> firstResult = executor.submit(task);
			Future<Boolean> secondResult = executor.submit(task);
			ready.await();
			start.countDown();

			assertThat(List.of(firstResult.get(), secondResult.get()))
					.containsExactlyInAnyOrder(true, false);
		} finally {
			executor.shutdownNow();
		}

		assertThat(pairRepository.count()).isEqualTo(1);
		assertThat(responseRepository.count()).isEqualTo(2);
		assertThat(requestRepository.findById(firstRequest.getId()).orElseThrow()
				.getStatus()).isEqualTo(MatchRequestStatus.MATCH_FOUND);
		assertThat(requestRepository.findById(secondRequest.getId()).orElseThrow()
				.getStatus()).isEqualTo(MatchRequestStatus.MATCH_FOUND);
	}
}
