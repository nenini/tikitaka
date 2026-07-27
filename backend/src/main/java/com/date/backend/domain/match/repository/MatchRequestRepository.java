package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MatchRequestRepository extends JpaRepository<MatchRequest, Long> {

	@EntityGraph(attributePaths = {"preferredFaceTag", "actualFaceTag"})
	@Query("SELECT request FROM MatchRequest request WHERE request.id = :id")
	Optional<MatchRequest> findByIdWithFaceTags(@Param("id") Long id);

	@EntityGraph(attributePaths = {"preferredFaceTag", "actualFaceTag"})
	Optional<MatchRequest> findFirstByUserIdAndStatusInOrderByRequestedAtDesc(
			Long userId,
			Collection<MatchRequestStatus> statuses
	);

	@EntityGraph(attributePaths = {"preferredFaceTag", "actualFaceTag"})
	List<MatchRequest> findAllByStatusOrderByRequestedAtAscIdAsc(
			MatchRequestStatus status,
			Pageable pageable
	);

	@EntityGraph(attributePaths = {"preferredFaceTag", "actualFaceTag"})
	List<MatchRequest> findAllByStatusOrderByRequestedAtAscIdAsc(
			MatchRequestStatus status
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			SELECT request
			FROM MatchRequest request
			WHERE request.id IN :ids
			ORDER BY request.id
			""")
	List<MatchRequest> findAllByIdForUpdate(@Param("ids") Collection<Long> ids);
}
