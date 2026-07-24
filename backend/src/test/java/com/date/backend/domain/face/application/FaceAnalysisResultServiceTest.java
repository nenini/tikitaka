package com.date.backend.domain.face.application;

import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;
import com.date.backend.domain.face.domain.FaceType;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultSubmitRequest;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultTagRequest;
import com.date.backend.domain.face.dto.response.FaceAnalysisResultResponse;
import com.date.backend.domain.face.repository.FaceAnalysisRequestRepository;
import com.date.backend.domain.face.repository.FaceAnalysisResultRepository;
import com.date.backend.domain.face.repository.UserFaceTagRepository;
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.FaceErrorCode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:face-result-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class FaceAnalysisResultServiceTest {
	private static final ZoneId SERVICE_ZONE_ID = ZoneId.of("Asia/Seoul");

	@Autowired
	private FaceAnalysisResultService faceAnalysisResultService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ProfileRepository profileRepository;

	@Autowired
	private FaceAnalysisRequestRepository faceAnalysisRequestRepository;

	@Autowired
	private FaceAnalysisResultRepository faceAnalysisResultRepository;

	@Autowired
	private UserFaceTagRepository userFaceTagRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	void validResultCompletesRequestAndReplacesCurrentFaceTags() {
		User user = saveUserWithProfile(Gender.MALE);
		FaceAnalysisRequest analysisRequest = savePendingRequest(user.getId());

		FaceAnalysisResultResponse response = faceAnalysisResultService.submitResult(
				user.getId(),
				analysisRequest.getId(),
				validRequest()
		);
		entityManager.flush();
		entityManager.clear();

		assertThat(response.analysisRequestId()).isEqualTo(analysisRequest.getId());
		assertThat(response.status()).isEqualTo(FaceAnalysisStatus.COMPLETED);
		assertThat(response.primaryType()).isEqualTo(FaceType.DOG);
		assertThat(response.modelVersion()).isEqualTo("face-type-v1");
		assertThat(response.tags())
				.extracting(tag -> tag.code())
				.containsExactly(FaceType.DOG, FaceType.CAT);
		assertThat(faceAnalysisRequestRepository.findById(analysisRequest.getId()))
				.get()
				.extracting(FaceAnalysisRequest::getStatus)
				.isEqualTo(FaceAnalysisStatus.COMPLETED);
		assertThat(faceAnalysisResultRepository
				.findFirstByUserIdOrderByAnalyzedAtDescIdDesc(user.getId()))
				.isPresent();
		assertThat(userFaceTagRepository.findAllByUserIdOrderByRankOrderAsc(user.getId()))
				.extracting(tag -> tag.getFaceTag().getCode())
				.containsExactly("DOG", "CAT");
	}

	@Test
	void latestResultCanBeRetrievedAfterSubmission() {
		User user = saveUserWithProfile(Gender.MALE);
		FaceAnalysisRequest analysisRequest = savePendingRequest(user.getId());
		faceAnalysisResultService.submitResult(
				user.getId(),
				analysisRequest.getId(),
				validRequest()
		);
		entityManager.flush();
		entityManager.clear();

		FaceAnalysisResultResponse response =
				faceAnalysisResultService.getMyLatestResult(user.getId());

		assertThat(response.analysisRequestId()).isEqualTo(analysisRequest.getId());
		assertThat(response.status()).isEqualTo(FaceAnalysisStatus.COMPLETED);
		assertThat(response.primaryType()).isEqualTo(FaceType.DOG);
		assertThat(response.tags())
				.extracting(tag -> tag.code())
				.containsExactly(FaceType.DOG, FaceType.CAT);
	}

	@Test
	void resultNotFoundIsReturnedWhenUserHasNoSavedResult() {
		User user = saveUserWithProfile(Gender.MALE);

		BusinessException exception = catchThrowableOfType(
				() -> faceAnalysisResultService.getMyLatestResult(user.getId()),
				BusinessException.class
		);

		assertThat(exception.getErrorCode())
				.isEqualTo(FaceErrorCode.ANALYSIS_RESULT_NOT_FOUND);
	}

	@Test
	void anotherUsersRequestCannotBeSubmitted() {
		User owner = saveUserWithProfile(Gender.MALE);
		User otherUser = saveUserWithProfile(Gender.FEMALE);
		FaceAnalysisRequest analysisRequest = savePendingRequest(owner.getId());

		BusinessException exception = catchThrowableOfType(
				() -> faceAnalysisResultService.submitResult(
						otherUser.getId(),
						analysisRequest.getId(),
						validRequest()
				),
				BusinessException.class
		);

		assertThat(exception.getErrorCode())
				.isEqualTo(FaceErrorCode.ANALYSIS_REQUEST_FORBIDDEN);
		assertThat(faceAnalysisResultRepository.count()).isZero();
	}

	@Test
	void expiredRequestIsPersistedAsExpiredWhileReturningError() {
		User user = saveUserWithProfile(Gender.MALE);
		LocalDateTime now = LocalDateTime.now(SERVICE_ZONE_ID);
		FaceAnalysisRequest analysisRequest = faceAnalysisRequestRepository.save(
				new FaceAnalysisRequest(
						user.getId(),
						now.minusMinutes(20),
						now.minusMinutes(10)
				)
		);

		BusinessException exception = catchThrowableOfType(
				() -> faceAnalysisResultService.submitResult(
						user.getId(),
						analysisRequest.getId(),
						validRequest()
				),
				BusinessException.class
		);
		entityManager.flush();
		entityManager.clear();

		assertThat(exception.getErrorCode())
				.isEqualTo(FaceErrorCode.ANALYSIS_REQUEST_EXPIRED);
		assertThat(faceAnalysisRequestRepository.findById(analysisRequest.getId()))
				.get()
				.extracting(FaceAnalysisRequest::getStatus)
				.isEqualTo(FaceAnalysisStatus.EXPIRED);
		assertThat(faceAnalysisResultRepository.count()).isZero();
	}

	@Test
	void duplicateOrDiscontinuousRanksAreRejected() {
		User user = saveUserWithProfile(Gender.MALE);
		FaceAnalysisRequest analysisRequest = savePendingRequest(user.getId());
		FaceAnalysisResultSubmitRequest invalidRequest =
				new FaceAnalysisResultSubmitRequest(
						"face-type-v1",
						List.of(
								new FaceAnalysisResultTagRequest(
										FaceType.DOG,
										new BigDecimal("0.700000"),
										(short) 1
								),
								new FaceAnalysisResultTagRequest(
										FaceType.CAT,
										new BigDecimal("0.300000"),
										(short) 1
								)
						)
				);

		BusinessException exception = catchThrowableOfType(
				() -> faceAnalysisResultService.submitResult(
						user.getId(),
						analysisRequest.getId(),
						invalidRequest
				),
				BusinessException.class
		);

		assertThat(exception.getErrorCode())
				.isEqualTo(FaceErrorCode.INVALID_ANALYSIS_RESULT);
		assertThat(faceAnalysisResultRepository.count()).isZero();
	}

	@Test
	void faceTypeForAnotherGenderIsRejected() {
		User user = saveUserWithProfile(Gender.MALE);
		FaceAnalysisRequest analysisRequest = savePendingRequest(user.getId());
		FaceAnalysisResultSubmitRequest invalidRequest =
				new FaceAnalysisResultSubmitRequest(
						"face-type-v1",
						List.of(
								new FaceAnalysisResultTagRequest(
										FaceType.TURTLE,
										BigDecimal.ONE,
										(short) 1
								)
						)
				);

		BusinessException exception = catchThrowableOfType(
				() -> faceAnalysisResultService.submitResult(
						user.getId(),
						analysisRequest.getId(),
						invalidRequest
				),
				BusinessException.class
		);

		assertThat(exception.getErrorCode())
				.isEqualTo(FaceErrorCode.FACE_TYPE_NOT_APPLICABLE);
		assertThat(faceAnalysisResultRepository.count()).isZero();
	}

	private FaceAnalysisResultSubmitRequest validRequest() {
		return new FaceAnalysisResultSubmitRequest(
				"face-type-v1",
				List.of(
						new FaceAnalysisResultTagRequest(
								FaceType.DOG,
								new BigDecimal("0.700000"),
								(short) 1
						),
						new FaceAnalysisResultTagRequest(
								FaceType.CAT,
								new BigDecimal("0.300000"),
								(short) 2
						)
				)
		);
	}

	private FaceAnalysisRequest savePendingRequest(Long userId) {
		LocalDateTime now = LocalDateTime.now(SERVICE_ZONE_ID);
		return faceAnalysisRequestRepository.save(new FaceAnalysisRequest(
				userId,
				now.minusMinutes(1),
				now.plusMinutes(9)
		));
	}

	private User saveUserWithProfile(Gender gender) {
		User user = userRepository.save(new User(
				"face-result-" + System.nanoTime() + "@example.com",
				"password-hash",
				"얼굴상 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		profileRepository.save(new Profile(
				user.getId(),
				"얼굴" + System.nanoTime(),
				gender,
				"서울"
		));
		return user;
	}
}
