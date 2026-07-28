package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;
import com.date.backend.domain.match.domain.TraitSnapshotType;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class MatchScorePolicy {

	private static final BigDecimal DIRECTION_SCORE = new BigDecimal("25.000");
	private static final BigDecimal PREFERRED_TRAIT_COUNT = new BigDecimal("3");

	public MatchScore calculate(
			MatchRequest first,
			Collection<MatchRequestTraitSnapshot> firstTraits,
			MatchRequest second,
			Collection<MatchRequestTraitSnapshot> secondTraits
	) {
		BigDecimal faceScore = scoreFace(first, second);
		BigDecimal traitScore = scoreTraits(firstTraits, secondTraits);
		return new MatchScore(
				faceScore,
				traitScore,
				faceScore.add(traitScore).setScale(3, RoundingMode.HALF_UP)
		);
	}

	private BigDecimal scoreFace(MatchRequest first, MatchRequest second) {
		BigDecimal score = BigDecimal.ZERO.setScale(3);
		if (first.getPreferredFaceTag().getId().equals(second.getActualFaceTag().getId())) {
			score = score.add(DIRECTION_SCORE);
		}
		if (second.getPreferredFaceTag().getId().equals(first.getActualFaceTag().getId())) {
			score = score.add(DIRECTION_SCORE);
		}
		return score;
	}

	private BigDecimal scoreTraits(
			Collection<MatchRequestTraitSnapshot> firstTraits,
			Collection<MatchRequestTraitSnapshot> secondTraits
	) {
		Set<Long> firstPreferred = traitIds(firstTraits, TraitSnapshotType.PREFERRED);
		Set<Long> firstSelf = traitIds(firstTraits, TraitSnapshotType.SELF);
		Set<Long> secondPreferred = traitIds(secondTraits, TraitSnapshotType.PREFERRED);
		Set<Long> secondSelf = traitIds(secondTraits, TraitSnapshotType.SELF);

		return directionalTraitScore(firstPreferred, secondSelf)
				.add(directionalTraitScore(secondPreferred, firstSelf))
				.setScale(3, RoundingMode.HALF_UP);
	}

	private BigDecimal directionalTraitScore(Set<Long> preferred, Set<Long> actual) {
		long matches = preferred.stream().filter(actual::contains).count();
		return BigDecimal.valueOf(matches)
				.multiply(DIRECTION_SCORE)
				.divide(PREFERRED_TRAIT_COUNT, 3, RoundingMode.HALF_UP);
	}

	private Set<Long> traitIds(
			Collection<MatchRequestTraitSnapshot> traits,
			TraitSnapshotType type
	) {
		return traits.stream()
				.filter(snapshot -> snapshot.getSnapshotType() == type)
				.map(snapshot -> snapshot.getTrait().getId())
				.collect(Collectors.toUnmodifiableSet());
	}
}
