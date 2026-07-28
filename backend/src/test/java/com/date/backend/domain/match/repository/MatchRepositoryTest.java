package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.application.MatchWaitingRecommendationService;
import com.date.backend.domain.match.domain.ActiveMatchRequest;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;
import com.date.backend.domain.match.domain.MatchResponse;
import com.date.backend.domain.match.domain.MatchResponseStatus;
import com.date.backend.domain.match.domain.MatchStatus;
import com.date.backend.domain.match.domain.TraitSnapshotType;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.domain.TraitCatalog;
import com.date.backend.domain.survey.domain.TraitType;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.survey.repository.TraitCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:match-repository-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class MatchRepositoryTest {

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private FaceTagCatalogRepository faceTagCatalogRepository;

	@Autowired
	private TraitCatalogRepository traitCatalogRepository;

	@Autowired
	private MatchRequestRepository matchRequestRepository;

	@Autowired
	private ActiveMatchRequestRepository activeMatchRequestRepository;

	@Autowired
	private MatchRequestSlotRepository matchRequestSlotRepository;

	@Autowired
	private MatchRequestTraitSnapshotRepository traitSnapshotRepository;

	@Autowired
	private MatchPairRepository matchPairRepository;

	@Autowired
	private MatchResponseRepository matchResponseRepository;

	@Autowired
	private MatchWaitingRecommendationService waitingRecommendationService;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	void requestStoresFaceTraitAndAvailabilitySnapshots() {
		User user = saveUser("match-snapshot@example.com", LocalDate.of(2000, 1, 1));
		List<FaceTagCatalog> faceTags =
				faceTagCatalogRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		List<TraitCatalog> traits = traitCatalogRepository
				.findAllByTypeAndActiveTrueOrderByDisplayOrderAsc(TraitType.PERSONALITY);
		MatchRequest request = matchRequestRepository.save(new MatchRequest(
				user.getId(),
				(short) 24,
				(short) 30,
				faceTags.get(0),
				faceTags.get(1)
		));

		activeMatchRequestRepository.save(new ActiveMatchRequest(user.getId(), request));
		matchRequestSlotRepository.save(new MatchRequestSlot(
				request,
				DayOfWeek.MONDAY,
				LocalTime.of(19, 0),
				LocalTime.of(22, 0)
		));
		traitSnapshotRepository.saveAll(List.of(
				new MatchRequestTraitSnapshot(
						request,
						traits.get(0),
						TraitSnapshotType.PREFERRED
				),
				new MatchRequestTraitSnapshot(
						request,
						traits.get(1),
						TraitSnapshotType.SELF
				)
		));
		entityManager.flush();
		entityManager.clear();

		MatchRequest found = matchRequestRepository.findById(request.getId()).orElseThrow();
		assertThat(found.getStatus()).isEqualTo(MatchRequestStatus.WAITING);
		assertThat(found.getPreferredAgeMin()).isEqualTo((short) 24);
		assertThat(found.getPreferredAgeMax()).isEqualTo((short) 30);
		assertThat(activeMatchRequestRepository.findById(user.getId()))
				.get()
				.extracting(active -> active.getMatchRequest().getId())
				.isEqualTo(request.getId());
		assertThat(matchRequestSlotRepository
				.findAllByMatchRequest_IdOrderByDayOfWeekAscStartTimeAsc(request.getId()))
				.singleElement()
				.satisfies(slot -> {
					assertThat(slot.getDayOfWeek()).isEqualTo(DayOfWeek.MONDAY);
					assertThat(slot.getStartTime()).isEqualTo(LocalTime.of(19, 0));
					assertThat(slot.getEndTime()).isEqualTo(LocalTime.of(22, 0));
				});
		assertThat(traitSnapshotRepository
				.findAllByMatchRequest_IdAndSnapshotTypeOrderByTrait_DisplayOrderAsc(
						request.getId(),
						TraitSnapshotType.PREFERRED
				))
				.extracting(snapshot -> snapshot.getTrait().getId())
				.containsExactly(traits.get(0).getId());
	}

	@Test
	void activeRequestReservationAllowsOnlyOneRequestPerUser() {
		User user = saveUser("active-match@example.com", LocalDate.of(2000, 2, 1));
		List<FaceTagCatalog> faceTags =
				faceTagCatalogRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		MatchRequest first = matchRequestRepository.save(new MatchRequest(
				user.getId(), (short) 24, (short) 30, faceTags.get(0), faceTags.get(1)
		));
		MatchRequest second = matchRequestRepository.save(new MatchRequest(
				user.getId(), (short) 25, (short) 31, faceTags.get(0), faceTags.get(1)
		));
		activeMatchRequestRepository.saveAndFlush(new ActiveMatchRequest(user.getId(), first));

		assertThatThrownBy(() -> jdbcTemplate.update(
				"INSERT INTO active_match_requests "
						+ "(userId, matchRequestId, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)",
				user.getId(),
				second.getId()
		)).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void pairAndParticipantResponsesArePersisted() {
		List<FaceTagCatalog> faceTags =
				faceTagCatalogRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		User userA = saveUser("match-a@example.com", LocalDate.of(2000, 3, 1));
		User userB = saveUser("match-b@example.com", LocalDate.of(2001, 3, 1));
		MatchRequest requestA = matchRequestRepository.save(new MatchRequest(
				userA.getId(), (short) 24, (short) 31, faceTags.get(0), faceTags.get(1)
		));
		MatchRequest requestB = matchRequestRepository.save(new MatchRequest(
				userB.getId(), (short) 24, (short) 31, faceTags.get(1), faceTags.get(0)
		));
		LocalDateTime now = LocalDateTime.of(2026, 7, 26, 20, 0);
		requestA.markMatchFound(now);
		requestB.markMatchFound(now);
		MatchPair pair = matchPairRepository.save(new MatchPair(
				requestB,
				requestA,
				new BigDecimal("50.000"),
				new BigDecimal("33.333"),
				now.plusMinutes(10)
		));
		matchResponseRepository.saveAll(List.of(
				new MatchResponse(pair, userA.getId()),
				new MatchResponse(pair, userB.getId())
		));
		entityManager.flush();
		entityManager.clear();

		MatchPair found = matchPairRepository.findById(pair.getId()).orElseThrow();
		assertThat(found.getRequestA().getId()).isLessThan(found.getRequestB().getId());
		assertThat(found.getStatus()).isEqualTo(MatchStatus.PENDING_ACCEPTANCE);
		assertThat(found.getFaceScore()).isEqualByComparingTo("50.000");
		assertThat(found.getTraitScore()).isEqualByComparingTo("33.333");
		assertThat(found.getTotalScore()).isEqualByComparingTo("83.333");
		assertThat(matchResponseRepository
				.findAllByMatchPair_IdOrderByUserIdAsc(pair.getId()))
				.extracting(MatchResponse::getResponse)
				.containsExactly(
						MatchResponseStatus.PENDING,
						MatchResponseStatus.PENDING
				);
		assertThat(matchPairRepository.existsActiveByUserId(
				userA.getId(),
				Set.of(MatchStatus.PENDING_ACCEPTANCE, MatchStatus.CONFIRMED)
		)).isTrue();
	}

	@Test
	void findsOnlyActiveRequestsWaitingForAtLeastTwentyFourHours() {
		List<FaceTagCatalog> faceTags =
				faceTagCatalogRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		LocalDateTime now = LocalDateTime.of(2026, 7, 28, 12, 0);
		User dueUser = saveUser("waiting-due@example.com", LocalDate.of(2000, 1, 1));
		User recentUser = saveUser("waiting-recent@example.com", LocalDate.of(2000, 1, 2));
		User inactiveUser = saveUser(
				"waiting-inactive@example.com",
				LocalDate.of(2000, 1, 3)
		);
		MatchRequest dueRequest = matchRequestRepository.save(new MatchRequest(
				dueUser.getId(),
				(short) 20,
				(short) 40,
				faceTags.get(0),
				faceTags.get(0),
				now.minusHours(24)
		));
		MatchRequest recentRequest = matchRequestRepository.save(new MatchRequest(
				recentUser.getId(),
				(short) 20,
				(short) 40,
				faceTags.get(0),
				faceTags.get(0),
				now.minusHours(23).minusMinutes(59)
		));
		matchRequestRepository.save(new MatchRequest(
				inactiveUser.getId(),
				(short) 20,
				(short) 40,
				faceTags.get(0),
				faceTags.get(0),
				now.minusHours(25)
		));
		activeMatchRequestRepository.saveAll(List.of(
				new ActiveMatchRequest(dueUser.getId(), dueRequest),
				new ActiveMatchRequest(recentUser.getId(), recentRequest)
		));
		entityManager.flush();
		entityManager.clear();

		assertThat(waitingRecommendationService.findDueTargets(now, 10))
				.singleElement()
				.satisfies(target -> {
					assertThat(target.userId()).isEqualTo(dueUser.getId());
					assertThat(target.matchRequestId()).isEqualTo(dueRequest.getId());
					assertThat(target.waitingStartedAt()).isEqualTo(now.minusHours(24));
				});
	}

	private User saveUser(String email, LocalDate birthDate) {
		return userRepository.save(new User(
				email,
				"password-hash",
				"매칭 사용자",
				null,
				birthDate
		));
	}
}
