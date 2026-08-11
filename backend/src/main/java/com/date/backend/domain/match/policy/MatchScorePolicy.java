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

	public MatchScore calculate(
			MatchRequest first,
			Collection<MatchRequestTraitSnapshot> firstTraits,
			MatchRequest second,
			Collection<MatchRequestTraitSnapshot> secondTraits
	) {
		return calculate(
				first,
				firstTraits,
				second,
				secondTraits,
				MatchingPolicySnapshot.defaults()
		);
	}

	public MatchScore calculate(
			MatchRequest first,
			Collection<MatchRequestTraitSnapshot> firstTraits,
			MatchRequest second,
			Collection<MatchRequestTraitSnapshot> secondTraits,
			MatchingPolicySnapshot policy
	) {
		BigDecimal faceScore = scoreFace(first, second, policy.faceTypeWeight());
		BigDecimal traitScore = scoreTraits(
				firstTraits,
				secondTraits,
				policy.personalityWeight()
		);
		return new MatchScore(
				faceScore,
				traitScore,
				faceScore.add(traitScore).setScale(3, RoundingMode.HALF_UP)
		);
	}

	private BigDecimal scoreFace(
			MatchRequest first,
			MatchRequest second,
			int weight
	) {
		int matches = 0;
		if (first.getPreferredFaceTag().getId().equals(second.getActualFaceTag().getId())) {
			matches++;
		}
		if (second.getPreferredFaceTag().getId().equals(first.getActualFaceTag().getId())) {
			matches++;
		}
		return weightedScore(matches, 2, weight);
	}

	private BigDecimal scoreTraits(
			Collection<MatchRequestTraitSnapshot> firstTraits,
			Collection<MatchRequestTraitSnapshot> secondTraits,
			int weight
	) {
		Set<Long> firstPreferred = traitIds(firstTraits, TraitSnapshotType.PREFERRED);
		Set<Long> firstSelf = traitIds(firstTraits, TraitSnapshotType.SELF);
		Set<Long> secondPreferred = traitIds(secondTraits, TraitSnapshotType.PREFERRED);
		Set<Long> secondSelf = traitIds(secondTraits, TraitSnapshotType.SELF);

		long matches = directionalTraitMatches(firstPreferred, secondSelf)
				+ directionalTraitMatches(secondPreferred, firstSelf);
		int possibleMatches = firstPreferred.size() + secondPreferred.size();
		return weightedScore(matches, possibleMatches, weight);
	}

	private long directionalTraitMatches(Set<Long> preferred, Set<Long> actual) {
		return preferred.stream().filter(actual::contains).count();
	}

	private BigDecimal weightedScore(long matches, int possibleMatches, int weight) {
		if (possibleMatches == 0 || weight == 0) {
			return BigDecimal.ZERO.setScale(3);
		}
		return BigDecimal.valueOf(matches)
				.multiply(BigDecimal.valueOf(weight))
				.divide(BigDecimal.valueOf(possibleMatches), 3, RoundingMode.HALF_UP);
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
