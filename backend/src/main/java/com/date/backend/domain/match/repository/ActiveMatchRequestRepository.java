package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.ActiveMatchRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ActiveMatchRequestRepository
		extends JpaRepository<ActiveMatchRequest, Long> {

	@EntityGraph(attributePaths = "matchRequest")
	Optional<ActiveMatchRequest> findByUserId(Long userId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@EntityGraph(attributePaths = "matchRequest")
	Optional<ActiveMatchRequest> findForUpdateByUserId(Long userId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@EntityGraph(attributePaths = "matchRequest")
	@Query("""
			SELECT active
			FROM ActiveMatchRequest active
			WHERE active.userId IN :userIds
			ORDER BY active.userId
			""")
	List<ActiveMatchRequest> findAllByUserIdForUpdate(
			@Param("userIds") Collection<Long> userIds
	);
}
