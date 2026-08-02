package com.date.backend.domain.face.repository;

import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.domain.FaceAnalysisResult;
import com.date.backend.domain.face.domain.FaceAnalysisResultTag;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;
import com.date.backend.domain.face.domain.UserFaceTag;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:face-analysis-repository-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class FaceAnalysisRepositoryTest {
	private static final LocalDateTime REQUESTED_AT =
			LocalDateTime.of(2026, 7, 24, 10, 0);
	private static final LocalDateTime ANALYZED_AT = REQUESTED_AT.plusMinutes(1);

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private FaceTagCatalogRepository faceTagCatalogRepository;

	@Autowired
	private FaceAnalysisRequestRepository faceAnalysisRequestRepository;

	@Autowired
	private FaceAnalysisResultRepository faceAnalysisResultRepository;

	@Autowired
	private UserFaceTagRepository userFaceTagRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	void resultHistoryAndCurrentUserFaceTagsCanBeStoredAndRetrieved() {
		User user = saveUser();
		FaceTagCatalog dog = findFaceTag("DOG");
		FaceTagCatalog cat = findFaceTag("CAT");
		FaceAnalysisRequest analysisRequest = faceAnalysisRequestRepository.save(
				new FaceAnalysisRequest(
						user.getId(),
						REQUESTED_AT,
						REQUESTED_AT.plusMinutes(10)
				)
		);
		FaceAnalysisResult result = new FaceAnalysisResult(
				analysisRequest,
				user.getId(),
				dog,
				"face-type-v1",
				ANALYZED_AT
		);
		result.addTag(dog, new BigDecimal("0.700000"), (short) 1);
		result.addTag(cat, new BigDecimal("0.300000"), (short) 2);
		result.validateTags();
		analysisRequest.complete(ANALYZED_AT);

		FaceAnalysisResult savedResult = faceAnalysisResultRepository.save(result);
		userFaceTagRepository.saveAll(
				result.getTags().stream()
						.map(UserFaceTag::from)
						.toList()
		);
		entityManager.flush();
		entityManager.clear();

		FaceAnalysisResult latestResult = faceAnalysisResultRepository
				.findFirstByUserIdOrderByAnalyzedAtDescIdDesc(user.getId())
				.orElseThrow();
		List<UserFaceTag> currentTags =
				userFaceTagRepository.findAllByUserIdOrderByRankOrderAsc(user.getId());

		assertThat(latestResult.getId()).isEqualTo(savedResult.getId());
		assertThat(latestResult.getAnalysisRequest().getStatus())
				.isEqualTo(FaceAnalysisStatus.COMPLETED);
		assertThat(latestResult.getTags())
				.extracting(tag -> tag.getFaceTag().getCode())
				.containsExactly("DOG", "CAT");
		assertThat(faceAnalysisResultRepository.existsByAnalysisRequest_Id(
				analysisRequest.getId()
		)).isTrue();
		assertThat(currentTags)
				.extracting(tag -> tag.getFaceTag().getCode())
				.containsExactly("DOG", "CAT");
		assertThat(currentTags)
				.extracting(UserFaceTag::getRelativeScore)
				.containsExactly(
						new BigDecimal("0.700000"),
						new BigDecimal("0.300000")
				);
		assertThat(currentTags)
				.allSatisfy(tag -> {
					assertThat(tag.getFaceAnalysisResult().getId())
							.isEqualTo(savedResult.getId());
					assertThat(tag.getAnalyzedAt()).isEqualTo(ANALYZED_AT);
				});
	}

	@Test
	void currentUserFaceTagsCanBeDeletedForReplacement() {
		User user = saveUser();
		FaceTagCatalog dog = findFaceTag("DOG");
		FaceAnalysisRequest analysisRequest = faceAnalysisRequestRepository.save(
				new FaceAnalysisRequest(
						user.getId(),
						REQUESTED_AT,
						REQUESTED_AT.plusMinutes(10)
				)
		);
		FaceAnalysisResult result = new FaceAnalysisResult(
				analysisRequest,
				user.getId(),
				dog,
				"face-type-v1",
				ANALYZED_AT
		);
		result.addTag(dog, BigDecimal.ONE, (short) 1);
		result.validateTags();
		analysisRequest.complete(ANALYZED_AT);
		faceAnalysisResultRepository.save(result);
		userFaceTagRepository.save(UserFaceTag.from(result.getTags().get(0)));
		entityManager.flush();

		int deletedCount = userFaceTagRepository.deleteAllByUserId(user.getId());
		entityManager.flush();
		entityManager.clear();

		assertThat(deletedCount).isEqualTo(1);
		assertThat(userFaceTagRepository.findAllByUserIdOrderByRankOrderAsc(user.getId()))
				.isEmpty();
	}

	private User saveUser() {
		return userRepository.save(new User(
				"face-repository-" + System.nanoTime() + "@example.com",
				"password-hash",
				"얼굴상 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
	}

	private FaceTagCatalog findFaceTag(String code) {
		return faceTagCatalogRepository.findAllByActiveTrueOrderByDisplayOrderAsc()
				.stream()
				.filter(faceTag -> faceTag.getCode().equals(code))
				.findFirst()
				.orElseThrow();
	}
}
