package com.date.backend.domain.match.application;

import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.dto.request.MatchRequestCancelRequest;
import com.date.backend.domain.match.dto.request.MatchRequestSaveRequest;
import com.date.backend.domain.match.dto.request.MatchRequestSlotInput;
import com.date.backend.domain.match.dto.response.MatchRequestResponse;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.domain.PreferredFaceTag;
import com.date.backend.domain.survey.domain.PreferredTrait;
import com.date.backend.domain.survey.domain.TraitCatalog;
import com.date.backend.domain.survey.domain.TraitType;
import com.date.backend.domain.survey.domain.UserTrait;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.survey.repository.PreferredFaceTagRepository;
import com.date.backend.domain.survey.repository.PreferredTraitRepository;
import com.date.backend.domain.survey.repository.TraitCatalogRepository;
import com.date.backend.domain.survey.repository.UserTraitRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.MatchErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:match-request-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class MatchRequestServiceTest {

	@Autowired
	private MatchRequestService matchRequestService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ProfileRepository profileRepository;

	@Autowired
	private FaceTagCatalogRepository faceTagCatalogRepository;

	@Autowired
	private TraitCatalogRepository traitCatalogRepository;

	@Autowired
	private PreferredFaceTagRepository preferredFaceTagRepository;

	@Autowired
	private PreferredTraitRepository preferredTraitRepository;

	@Autowired
	private UserTraitRepository userTraitRepository;

	@Autowired
	private MatchRequestRepository matchRequestRepository;

	@Autowired
	private ActiveMatchRequestRepository activeMatchRequestRepository;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	private Long userId;

	@BeforeEach
	void setUpUserWithMatchSource() {
		User user = userRepository.save(new User(
				"match-request-service@example.com",
				"password-hash",
				"매칭 신청자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		userId = user.getId();
		profileRepository.save(new Profile(userId, "매칭신청자", Gender.FEMALE, "서울"));

		List<FaceTagCatalog> faceTags =
				faceTagCatalogRepository.findAllByActiveTrueOrderByDisplayOrderAsc();
		List<TraitCatalog> traits = traitCatalogRepository
				.findAllByTypeAndActiveTrueOrderByDisplayOrderAsc(TraitType.PERSONALITY);
		preferredFaceTagRepository.save(new PreferredFaceTag(userId, faceTags.get(0)));
		preferredTraitRepository.saveAll(List.of(
				new PreferredTrait(userId, traits.get(0)),
				new PreferredTrait(userId, traits.get(1)),
				new PreferredTrait(userId, traits.get(2))
		));
		userTraitRepository.saveAll(List.of(
				new UserTrait(userId, traits.get(3)),
				new UserTrait(userId, traits.get(4)),
				new UserTrait(userId, traits.get(5))
		));
		jdbcTemplate.update(
				"""
				INSERT INTO user_face_tags
				    (userId, faceTagId, relativeScore, rankOrder, analyzedAt)
				VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
				""",
				userId,
				faceTags.get(1).getId(),
				0.9,
				1
		);
	}

	@Test
	void createStoresCurrentSurveyAndFaceAsSnapshots() {
		MatchRequestResponse response = matchRequestService.create(userId, validRequest());

		assertThat(response.status()).isEqualTo(MatchRequestStatus.WAITING);
		assertThat(response.preferredAgeMin()).isEqualTo((short) 24);
		assertThat(response.preferredAgeMax()).isEqualTo((short) 30);
		assertThat(response.preferredTraits()).hasSize(3);
		assertThat(response.selfTraits()).hasSize(3);
		assertThat(response.availableSlots()).hasSize(2);
		assertThat(activeMatchRequestRepository.existsById(userId)).isTrue();
	}

	@Test
	void duplicateActiveRequestIsRejected() {
		matchRequestService.create(userId, validRequest());

		BusinessException exception = catchThrowableOfType(
				() -> matchRequestService.create(userId, validRequest()),
				BusinessException.class
		);

		assertThat(exception.getErrorCode())
				.isEqualTo(MatchErrorCode.MATCH_REQUEST_ALREADY_ACTIVE);
	}

	@Test
	void updateReplacesRequestConditionsAndSnapshots() {
		matchRequestService.create(userId, validRequest());
		MatchRequestSaveRequest updateRequest = new MatchRequestSaveRequest(
				(short) 26,
				(short) 32,
				List.of(new MatchRequestSlotInput(
						DayOfWeek.FRIDAY,
						LocalTime.of(20, 0),
						LocalTime.of(23, 0)
				))
		);

		MatchRequestResponse response = matchRequestService.update(userId, updateRequest);

		assertThat(response.preferredAgeMin()).isEqualTo((short) 26);
		assertThat(response.preferredAgeMax()).isEqualTo((short) 32);
		assertThat(response.availableSlots())
				.singleElement()
				.satisfies(slot -> assertThat(slot.dayOfWeek()).isEqualTo(DayOfWeek.FRIDAY));
		assertThat(response.preferredTraits()).hasSize(3);
		assertThat(response.selfTraits()).hasSize(3);
	}

	@Test
	void cancelTerminatesWaitingRequestAndReleasesActiveReservation() {
		MatchRequestResponse created = matchRequestService.create(userId, validRequest());

		matchRequestService.cancel(userId, new MatchRequestCancelRequest("일정 변경"));

		assertThat(activeMatchRequestRepository.existsById(userId)).isFalse();
		assertThat(matchRequestRepository.findById(created.matchRequestId()))
				.get()
				.satisfies(request -> {
					assertThat(request.getStatus()).isEqualTo(MatchRequestStatus.CANCELLED);
					assertThat(request.getCancellationReason()).isEqualTo("일정 변경");
					assertThat(request.getCancelledAt()).isNotNull();
				});
	}

	@Test
	void overlappingAvailabilityIsRejected() {
		MatchRequestSaveRequest request = new MatchRequestSaveRequest(
				(short) 24,
				(short) 30,
				List.of(
						new MatchRequestSlotInput(
								DayOfWeek.MONDAY,
								LocalTime.of(19, 0),
								LocalTime.of(21, 0)
						),
						new MatchRequestSlotInput(
								DayOfWeek.MONDAY,
								LocalTime.of(20, 0),
								LocalTime.of(22, 0)
						)
				)
		);

		BusinessException exception = catchThrowableOfType(
				() -> matchRequestService.create(userId, request),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(MatchErrorCode.INVALID_MATCH_REQUEST);
	}

	private MatchRequestSaveRequest validRequest() {
		return new MatchRequestSaveRequest(
				(short) 24,
				(short) 30,
				List.of(
						new MatchRequestSlotInput(
								DayOfWeek.MONDAY,
								LocalTime.of(19, 0),
								LocalTime.of(22, 0)
						),
						new MatchRequestSlotInput(
								DayOfWeek.WEDNESDAY,
								LocalTime.of(20, 0),
								LocalTime.of(23, 0)
						)
				)
		);
	}
}
