package com.date.backend.domain.match.dto.response;

import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;

public record MatchTraitSnapshotResponse(
		Long id,
		String code,
		String name
) {
	public static MatchTraitSnapshotResponse from(MatchRequestTraitSnapshot snapshot) {
		return new MatchTraitSnapshotResponse(
				snapshot.getTrait().getId(),
				snapshot.getTrait().getCode(),
				snapshot.getTrait().getName()
		);
	}
}
