package com.date.backend.domain.survey.application;

import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.survey.domain.ApplicableGender;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.dto.request.SurveySaveRequest;
import com.date.backend.domain.survey.dto.response.SurveyOptionsResponse;
import com.date.backend.domain.survey.dto.response.SurveyResponse;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SurveyErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:survey-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class SurveyServiceTest {

	@Autowired
	private SurveyService surveyService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ProfileRepository profileRepository;

	@Autowired
	private FaceTagCatalogRepository faceTagCatalogRepository;

	private Long userId;

	@BeforeEach
	void setUp() {
		User user = userRepository.save(new User(
				"survey-service@example.com",
				"password-hash",
				"설문 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		userId = user.getId();
		profileRepository.save(new Profile(userId, "설문별", Gender.MALE, "서울"));
	}

	@Test
	void optionsContainFaceTagsForPreferredPartnerGender() {
		SurveyOptionsResponse options = surveyService.getOptions(userId);

		assertThat(options.faceTags()).hasSize(9);
		assertThat(options.faceTags())
				.extracting(option -> option.applicableGender())
				.contains(ApplicableGender.FEMALE)
				.doesNotContain(ApplicableGender.MALE);
		assertThat(options.traits()).hasSize(11);
		assertThat(options.practiceGoals()).hasSize(5);
	}

	@Test
	void surveyCanBeCreatedAndRetrievedAsOneAggregate() {
		SurveyOptionsResponse options = surveyService.getOptions(userId);
		SurveySaveRequest request = request(options, 0, 0, 3, List.of(0, 2), (short) 25, (short) 32);

		SurveyResponse created = surveyService.create(userId, request);
		SurveyResponse found = surveyService.get(userId);

		assertThat(created.preferredFaceTag().id()).isEqualTo(request.preferredFaceTagId());
		assertThat(created.preferredTraits()).hasSize(3);
		assertThat(created.userTraits()).hasSize(3);
		assertThat(created.practiceGoals()).hasSize(2);
		assertThat(created.minPreferredAge()).isEqualTo((short) 25);
		assertThat(created.maxPreferredAge()).isEqualTo((short) 32);
		assertThat(found).isEqualTo(created);
		assertThat(profileRepository.findById(userId))
				.get()
				.extracting(Profile::isOnboardingCompleted)
				.isEqualTo(false);
	}

	@Test
	void surveyCanBeReplacedWhenOnboardingIsRetried() {
		SurveyOptionsResponse options = surveyService.getOptions(userId);
		surveyService.create(
				userId,
				request(options, 0, 0, 3, List.of(0), (short) 25, (short) 32)
		);
		SurveySaveRequest updateRequest = request(
				options,
				1,
				5,
				8,
				List.of(2, 4),
				(short) 28,
				(short) 35
		);

		SurveyResponse updated = surveyService.update(userId, updateRequest);

		assertThat(updated.preferredFaceTag().id()).isEqualTo(updateRequest.preferredFaceTagId());
		assertThat(updated.preferredTraits())
				.extracting(option -> option.id())
				.containsExactlyInAnyOrderElementsOf(updateRequest.preferredTraitIds());
		assertThat(updated.userTraits())
				.extracting(option -> option.id())
				.containsExactlyInAnyOrderElementsOf(updateRequest.userTraitIds());
		assertThat(updated.practiceGoals())
				.extracting(option -> option.id())
				.containsExactlyInAnyOrderElementsOf(updateRequest.practiceGoalIds());
		assertThat(updated.minPreferredAge()).isEqualTo((short) 28);
		assertThat(updated.maxPreferredAge()).isEqualTo((short) 35);
	}

	@Test
	void duplicateSurveyCreationIsRejected() {
		SurveyOptionsResponse options = surveyService.getOptions(userId);
		SurveySaveRequest request = request(options, 0, 0, 3, List.of(0), (short) 25, (short) 32);
		surveyService.create(userId, request);

		BusinessException exception = catchThrowableOfType(
				() -> surveyService.create(userId, request),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(SurveyErrorCode.SURVEY_ALREADY_EXISTS);
	}

	@Test
	void faceTagForWrongPartnerGenderIsRejected() {
		SurveyOptionsResponse options = surveyService.getOptions(userId);
		FaceTagCatalog maleOnlyFaceTag = faceTagCatalogRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc()
				.stream()
				.filter(faceTag -> faceTag.getApplicableGender() == ApplicableGender.MALE)
				.findFirst()
				.orElseThrow();
		SurveySaveRequest request = new SurveySaveRequest(
				maleOnlyFaceTag.getId(),
				traitIds(options, 0),
				traitIds(options, 3),
				(short) 25,
				(short) 32,
				goalIds(options, List.of(0))
		);

		BusinessException exception = catchThrowableOfType(
				() -> surveyService.create(userId, request),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(SurveyErrorCode.INVALID_SURVEY_OPTION);
	}

	@Test
	void missingSurveyCannotBeRetrievedOrUpdated() {
		SurveyOptionsResponse options = surveyService.getOptions(userId);
		SurveySaveRequest request = request(options, 0, 0, 3, List.of(0), (short) 25, (short) 32);

		BusinessException getException = catchThrowableOfType(
				() -> surveyService.get(userId),
				BusinessException.class
		);
		BusinessException updateException = catchThrowableOfType(
				() -> surveyService.update(userId, request),
				BusinessException.class
		);

		assertThat(getException.getErrorCode()).isEqualTo(SurveyErrorCode.SURVEY_NOT_FOUND);
		assertThat(updateException.getErrorCode()).isEqualTo(SurveyErrorCode.SURVEY_NOT_FOUND);
	}

	private SurveySaveRequest request(
			SurveyOptionsResponse options,
			int faceTagIndex,
			int preferredTraitStartIndex,
			int userTraitStartIndex,
			List<Integer> goalIndexes,
			short minPreferredAge,
			short maxPreferredAge
	) {
		return new SurveySaveRequest(
				options.faceTags().get(faceTagIndex).id(),
				traitIds(options, preferredTraitStartIndex),
				traitIds(options, userTraitStartIndex),
				minPreferredAge,
				maxPreferredAge,
				goalIds(options, goalIndexes)
		);
	}

	private List<Long> traitIds(SurveyOptionsResponse options, int startIndex) {
		return options.traits()
				.subList(startIndex, startIndex + 3)
				.stream()
				.map(option -> option.id())
				.toList();
	}

	private List<Long> goalIds(SurveyOptionsResponse options, List<Integer> indexes) {
		return indexes.stream()
				.map(index -> options.practiceGoals().get(index).id())
				.toList();
	}
}
