package com.date.backend.domain.result.repository;

import com.date.backend.domain.result.domain.PeerEvaluation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PeerEvaluationRepository extends JpaRepository<PeerEvaluation, Long> {
	boolean existsBySessionIdAndEvaluatorUserId(Long sessionId, Long evaluatorUserId);

	long countBySessionId(Long sessionId);

	Optional<PeerEvaluation> findBySessionIdAndEvaluatorUserId(
			Long sessionId,
			Long evaluatorUserId
	);

	Optional<PeerEvaluation> findBySessionIdAndEvaluateeUserId(
			Long sessionId,
			Long evaluateeUserId
	);

	List<PeerEvaluation> findAllBySessionIdOrderBySubmittedAtAsc(Long sessionId);
}
