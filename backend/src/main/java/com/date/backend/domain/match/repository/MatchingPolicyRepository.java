package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.MatchingPolicy;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface MatchingPolicyRepository extends JpaRepository<MatchingPolicy, Long> {

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("SELECT policy FROM MatchingPolicy policy WHERE policy.id = :id")
	Optional<MatchingPolicy> findByIdForUpdate(@Param("id") Long id);
}
