package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.MatchResponse;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.List;
import java.util.Optional;

public interface MatchResponseRepository extends JpaRepository<MatchResponse, Long> {

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<MatchResponse> findForUpdateByMatchPair_IdAndUserId(
			Long matchPairId,
			Long userId
	);

	List<MatchResponse> findAllByMatchPair_IdOrderByUserIdAsc(Long matchPairId);
}
