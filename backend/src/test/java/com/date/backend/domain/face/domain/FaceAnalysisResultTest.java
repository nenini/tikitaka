package com.date.backend.domain.face.domain;

import com.date.backend.domain.survey.domain.FaceTagCatalog;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FaceAnalysisResultTest {
	private static final Long USER_ID = 1L;
	private static final LocalDateTime REQUESTED_AT =
			LocalDateTime.of(2026, 7, 24, 10, 0);
	private static final LocalDateTime ANALYZED_AT = REQUESTED_AT.plusMinutes(1);

	@Test
	void supportsAllAiFaceTypes() {
		assertThat(FaceType.values()).containsExactly(
				FaceType.DOG,
				FaceType.CAT,
				FaceType.RABBIT,
				FaceType.FOX,
				FaceType.DEER,
				FaceType.TURTLE,
				FaceType.HAMSTER,
				FaceType.SNAKE,
				FaceType.DINOSAUR,
				FaceType.WOLF
		);
	}

	@Test
	void resultStoresRankedTagsAndNormalizesModelVersion() {
		FaceTagCatalog dog = faceTag("DOG");
		FaceTagCatalog cat = faceTag("CAT");
		FaceAnalysisResult result = createResult(dog, " model-v1 ");

		result.addTag(cat, new BigDecimal("0.300000"), (short) 2);
		result.addTag(dog, new BigDecimal("0.700000"), (short) 1);
		result.validateTags();

		assertThat(result.getUserId()).isEqualTo(USER_ID);
		assertThat(result.getPrimaryFaceTag()).isSameAs(dog);
		assertThat(result.getModelVersion()).isEqualTo("model-v1");
		assertThat(result.getAnalyzedAt()).isEqualTo(ANALYZED_AT);
		assertThat(result.getTags())
				.extracting(FaceAnalysisResultTag::getRankOrder)
				.containsExactly((short) 1, (short) 2);
	}

	@Test
	void resultTagsCannotBeModifiedOutsideAggregate() {
		FaceTagCatalog dog = faceTag("DOG");
		FaceAnalysisResult result = createResult(dog, "model-v1");
		result.addTag(dog, BigDecimal.ONE, (short) 1);

		List<FaceAnalysisResultTag> tags = result.getTags();

		assertThatExceptionOfType(UnsupportedOperationException.class)
				.isThrownBy(() -> tags.add(null));
	}

	@Test
	void requestOwnerAndResultOwnerMustMatch() {
		FaceAnalysisRequest request = createRequest();

		assertThatIllegalArgumentException().isThrownBy(
				() -> new FaceAnalysisResult(
						request,
						2L,
						faceTag("DOG"),
						"model-v1",
						ANALYZED_AT
				)
		);
	}

	@Test
	void modelVersionMustNotBeBlankOrLongerThanColumnLength() {
		FaceTagCatalog dog = faceTag("DOG");

		assertThatIllegalArgumentException()
				.isThrownBy(() -> createResult(dog, " "));
		assertThatIllegalArgumentException()
				.isThrownBy(() -> createResult(dog, "a".repeat(101)));
	}

	@Test
	void analyzedAtCannotBeBeforeRequestCreation() {
		FaceAnalysisRequest request = createRequest();

		assertThatIllegalArgumentException().isThrownBy(
				() -> new FaceAnalysisResult(
						request,
						USER_ID,
						faceTag("DOG"),
						"model-v1",
						REQUESTED_AT.minusNanos(1)
				)
		);
	}

	@Test
	void relativeScoreMustBeBetweenZeroAndOneWithUpToSixDecimalPlaces() {
		FaceTagCatalog dog = faceTag("DOG");
		FaceAnalysisResult result = createResult(dog, "model-v1");

		assertThatIllegalArgumentException().isThrownBy(
				() -> result.addTag(dog, new BigDecimal("-0.000001"), (short) 1)
		);
		assertThatIllegalArgumentException().isThrownBy(
				() -> result.addTag(dog, new BigDecimal("1.000001"), (short) 1)
		);
		assertThatIllegalArgumentException().isThrownBy(
				() -> result.addTag(dog, new BigDecimal("0.1234567"), (short) 1)
		);
	}

	@Test
	void firstRankMustMatchPrimaryFaceTag() {
		FaceTagCatalog dog = faceTag("DOG");
		FaceAnalysisResult result = createResult(dog, "model-v1");

		assertThatIllegalArgumentException().isThrownBy(
				() -> result.addTag(faceTag("CAT"), BigDecimal.ONE, (short) 1)
		);
		assertThatIllegalArgumentException().isThrownBy(
				() -> result.addTag(dog, BigDecimal.ONE, (short) 2)
		);
	}

	@Test
	void duplicateFaceTagOrRankCannotBeAdded() {
		FaceTagCatalog dog = faceTag("DOG");
		FaceAnalysisResult result = createResult(dog, "model-v1");
		result.addTag(dog, new BigDecimal("0.700000"), (short) 1);

		assertThatIllegalArgumentException().isThrownBy(
				() -> result.addTag(faceTag("DOG"), new BigDecimal("0.200000"), (short) 2)
		);
		assertThatIllegalArgumentException().isThrownBy(
				() -> result.addTag(faceTag("CAT"), new BigDecimal("0.300000"), (short) 1)
		);
	}

	@Test
	void unsupportedFaceTypeCannotBeAdded() {
		FaceAnalysisResult result = createResult(faceTag("DOG"), "model-v1");

		assertThatIllegalArgumentException().isThrownBy(
				() -> result.addTag(faceTag("UNKNOWN"), BigDecimal.ONE, (short) 1)
		);
	}

	@Test
	void tagsMustExistAndRanksMustBeContinuousFromOne() {
		FaceTagCatalog dog = faceTag("DOG");
		FaceAnalysisResult result = createResult(dog, "model-v1");

		assertThatIllegalStateException().isThrownBy(result::validateTags);

		result.addTag(dog, new BigDecimal("0.700000"), (short) 1);
		result.addTag(faceTag("CAT"), new BigDecimal("0.200000"), (short) 3);

		assertThatIllegalStateException().isThrownBy(result::validateTags);
	}

	private FaceAnalysisResult createResult(
			FaceTagCatalog primaryFaceTag,
			String modelVersion
	) {
		return new FaceAnalysisResult(
				createRequest(),
				USER_ID,
				primaryFaceTag,
				modelVersion,
				ANALYZED_AT
		);
	}

	private FaceAnalysisRequest createRequest() {
		return new FaceAnalysisRequest(
				USER_ID,
				REQUESTED_AT,
				REQUESTED_AT.plusMinutes(10)
		);
	}

	private FaceTagCatalog faceTag(String code) {
		FaceTagCatalog faceTag = mock(FaceTagCatalog.class);
		when(faceTag.getCode()).thenReturn(code);
		return faceTag;
	}
}
