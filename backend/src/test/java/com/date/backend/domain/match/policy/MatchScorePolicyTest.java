package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;
import com.date.backend.domain.match.domain.TraitSnapshotType;
import com.date.backend.domain.survey.domain.FaceTagCatalog;
import com.date.backend.domain.survey.domain.TraitCatalog;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MatchScorePolicyTest {

	private final MatchScorePolicy policy = new MatchScorePolicy();

	@Test
	void calculatesBidirectionalFaceAndTraitScoreWithHalfUpRounding() {
		FaceTagCatalog dog = faceTag(1L);
		FaceTagCatalog cat = faceTag(2L);
		MatchRequest first = request(dog, cat);
		MatchRequest second = request(cat, dog);

		List<MatchRequestTraitSnapshot> firstTraits = List.of(
				trait(1L, TraitSnapshotType.PREFERRED),
				trait(2L, TraitSnapshotType.PREFERRED),
				trait(3L, TraitSnapshotType.PREFERRED),
				trait(4L, TraitSnapshotType.SELF),
				trait(5L, TraitSnapshotType.SELF),
				trait(6L, TraitSnapshotType.SELF)
		);
		List<MatchRequestTraitSnapshot> secondTraits = List.of(
				trait(4L, TraitSnapshotType.PREFERRED),
				trait(7L, TraitSnapshotType.PREFERRED),
				trait(8L, TraitSnapshotType.PREFERRED),
				trait(1L, TraitSnapshotType.SELF),
				trait(9L, TraitSnapshotType.SELF),
				trait(10L, TraitSnapshotType.SELF)
		);

		MatchScore score = policy.calculate(first, firstTraits, second, secondTraits);

		assertThat(score.faceScore()).isEqualByComparingTo("50.000");
		assertThat(score.traitScore()).isEqualByComparingTo("16.667");
		assertThat(score.totalScore()).isEqualByComparingTo("66.667");
	}

	@Test
	void supportsOneHundredPercentFaceWeightAndZeroPersonalityWeight() {
		FaceTagCatalog dog = faceTag(1L);
		FaceTagCatalog cat = faceTag(2L);
		MatchRequest first = request(dog, cat);
		MatchRequest second = request(cat, dog);

		MatchScore score = policy.calculate(
				first,
				List.of(),
				second,
				List.of(),
				new MatchingPolicySnapshot(100, 0, 8, 60, 60, 7, 7, 60, 2)
		);

		assertThat(score.faceScore()).isEqualByComparingTo("100.000");
		assertThat(score.traitScore()).isEqualByComparingTo("0.000");
		assertThat(score.totalScore()).isEqualByComparingTo("100.000");
	}

	private MatchRequest request(FaceTagCatalog preferred, FaceTagCatalog actual) {
		MatchRequest request = mock(MatchRequest.class);
		when(request.getPreferredFaceTag()).thenReturn(preferred);
		when(request.getActualFaceTag()).thenReturn(actual);
		return request;
	}

	private FaceTagCatalog faceTag(Long id) {
		FaceTagCatalog tag = mock(FaceTagCatalog.class);
		when(tag.getId()).thenReturn(id);
		return tag;
	}

	private MatchRequestTraitSnapshot trait(Long id, TraitSnapshotType type) {
		TraitCatalog trait = mock(TraitCatalog.class);
		when(trait.getId()).thenReturn(id);
		MatchRequestTraitSnapshot snapshot = mock(MatchRequestTraitSnapshot.class);
		when(snapshot.getTrait()).thenReturn(trait);
		when(snapshot.getSnapshotType()).thenReturn(type);
		return snapshot;
	}
}
