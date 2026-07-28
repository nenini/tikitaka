package com.date.backend.domain.match.dto.response;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;
import com.date.backend.domain.match.domain.TraitSnapshotType;

import java.time.LocalDateTime;
import java.util.List;

public record MatchRequestResponse(
		Long matchRequestId,
		MatchRequestStatus status,
		short preferredAgeMin,
		short preferredAgeMax,
		MatchFaceSnapshotResponse preferredFaceTag,
		MatchFaceSnapshotResponse actualFaceTag,
		List<MatchTraitSnapshotResponse> preferredTraits,
		List<MatchTraitSnapshotResponse> selfTraits,
		List<MatchRequestSlotResponse> availableSlots,
		LocalDateTime requestedAt,
		LocalDateTime waitingStartedAt,
		LocalDateTime matchedAt,
		LocalDateTime cancelledAt
) {
	public static MatchRequestResponse of(
			MatchRequest request,
			List<MatchRequestSlot> slots,
			List<MatchRequestTraitSnapshot> traits
	) {
		return new MatchRequestResponse(
				request.getId(),
				request.getStatus(),
				request.getPreferredAgeMin(),
				request.getPreferredAgeMax(),
				MatchFaceSnapshotResponse.from(request.getPreferredFaceTag()),
				MatchFaceSnapshotResponse.from(request.getActualFaceTag()),
				toTraitResponses(traits, TraitSnapshotType.PREFERRED),
				toTraitResponses(traits, TraitSnapshotType.SELF),
				slots.stream().map(MatchRequestSlotResponse::from).toList(),
				request.getRequestedAt(),
				request.getWaitingStartedAt(),
				request.getMatchedAt(),
				request.getCancelledAt()
		);
	}

	private static List<MatchTraitSnapshotResponse> toTraitResponses(
			List<MatchRequestTraitSnapshot> traits,
			TraitSnapshotType type
	) {
		return traits.stream()
				.filter(snapshot -> snapshot.getSnapshotType() == type)
				.map(MatchTraitSnapshotResponse::from)
				.toList();
	}
}
