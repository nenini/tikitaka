package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.ActiveMatchRequest;
import com.date.backend.domain.match.domain.MatchJobStatus;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
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
import com.date.backend.domain.user.domain.KoreanAgeCalculator;
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
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:match-population-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate",
		"match.scheduler.enabled=false",
		"match.worker.enabled=false",
		"match.worker.batch-size=20"
})
@ActiveProfiles("test")
class MatchPopulationIntegrationTest {

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

	@Test
	void matchesManyUsersWithoutViolatingGenderAgeScheduleOrUniqueness() {
		List<FaceTagCatalog> faceTags =
				faceTagRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		assertThat(faceTags).hasSizeGreaterThanOrEqualTo(2);

		List<TestApplicant> applicants = new ArrayList<>();
		for (int index = 0; index < 6; index++) {
			applicants.add(saveApplicant(
					"male-" + index,
					Gender.MALE,
					LocalDate.of(2000 + index, 12, 31),
					faceTags.get(index % 2)
			));
		}
		for (int index = 0; index < 5; index++) {
			applicants.add(saveApplicant(
					"female-" + index,
					Gender.FEMALE,
					LocalDate.of(2000 + index, 1, 1),
					faceTags.get(index % 2)
			));
		}

		applicants.forEach(applicant -> enqueueService.enqueue(applicant.request()));
		String workerId = "population-test-worker";
		List<ClaimedMatchJob> claimedJobs = claimService.claim(
				workerId,
				LocalDateTime.now().plusSeconds(1)
		);
		assertThat(claimedJobs).hasSize(11);
		claimedJobs.forEach(job -> processor.process(job.jobId(), workerId));

		List<MatchPair> pairs = pairRepository.findAll();
		Map<Long, TestApplicant> applicantByUserId = applicants.stream()
				.collect(Collectors.toMap(
						applicant -> applicant.user().getId(),
						Function.identity()
				));
		Set<Long> matchedUserIds = new HashSet<>();

		assertThat(pairs).hasSize(5);
		for (MatchPair pair : pairs) {
			TestApplicant first = applicantByUserId.get(pair.getUserAId());
			TestApplicant second = applicantByUserId.get(pair.getUserBId());
			LocalDate referenceDate = pair.getMatchedAt().toLocalDate();

			assertThat(first.profile().getGender())
					.isNotEqualTo(second.profile().getGender());
			assertThat(accepts(first.request(), second.user(), referenceDate)).isTrue();
			assertThat(accepts(second.request(), first.user(), referenceDate)).isTrue();
			assertThat(first.request().getPreferredFaceTag().getId())
					.isEqualTo(second.request().getActualFaceTag().getId());
			assertThat(second.request().getPreferredFaceTag().getId())
					.isEqualTo(first.request().getActualFaceTag().getId());
			assertThat(matchedUserIds.add(pair.getUserAId())).isTrue();
			assertThat(matchedUserIds.add(pair.getUserBId())).isTrue();
		}

		assertThat(matchedUserIds).hasSize(10);
		assertThat(requestRepository.findAllByStatusOrderByRequestedAtAscIdAsc(
				MatchRequestStatus.MATCH_FOUND
		)).hasSize(10);
		assertThat(requestRepository.findAllByStatusOrderByRequestedAtAscIdAsc(
				MatchRequestStatus.WAITING
		))
				.singleElement()
				.satisfies(request -> assertThat(
						applicantByUserId.get(request.getUserId()).profile().getGender()
				).isEqualTo(Gender.MALE));
		assertThat(responseRepository.count()).isEqualTo(10);
		assertThat(jobRepository.findAll())
				.allMatch(job -> job.getStatus() == MatchJobStatus.COMPLETED);
	}

	private TestApplicant saveApplicant(
			String key,
			Gender gender,
			LocalDate birthDate,
			FaceTagCatalog faceTag
	) {
		int sequence = Math.abs(key.hashCode() % 1_000_000);
		User user = userRepository.save(new User(
				key + "@example.com",
				"password",
				key,
				"010" + String.format("%08d", sequence),
				birthDate
		));
		Profile profile = profileRepository.save(new Profile(
				user.getId(),
				key,
				gender,
				"서울"
		));
		MatchRequest request = requestRepository.save(new MatchRequest(
				user.getId(),
				(short) 20,
				(short) 40,
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
		return new TestApplicant(user, profile, request);
	}

	private boolean accepts(
			MatchRequest request,
			User candidate,
			LocalDate referenceDate
	) {
		int age = KoreanAgeCalculator.calculate(candidate.getBirthDate(), referenceDate);
		return age >= request.getPreferredAgeMin()
				&& age <= request.getPreferredAgeMax();
	}

	private record TestApplicant(
			User user,
			Profile profile,
			MatchRequest request
	) {
	}
}
