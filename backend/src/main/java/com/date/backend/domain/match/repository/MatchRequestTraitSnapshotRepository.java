package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;
import com.date.backend.domain.match.domain.TraitSnapshotType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface MatchRequestTraitSnapshotRepository
		extends JpaRepository<MatchRequestTraitSnapshot, Long> {

	@EntityGraph(attributePaths = "trait")
	List<MatchRequestTraitSnapshot> findAllByMatchRequest_IdAndSnapshotTypeOrderByTrait_DisplayOrderAsc(
			Long matchRequestId,
			TraitSnapshotType snapshotType
	);

	@EntityGraph(attributePaths = "trait")
	List<MatchRequestTraitSnapshot> findAllByMatchRequest_IdIn(
			Collection<Long> matchRequestIds
	);

	void deleteAllByMatchRequest_Id(Long matchRequestId);
}
