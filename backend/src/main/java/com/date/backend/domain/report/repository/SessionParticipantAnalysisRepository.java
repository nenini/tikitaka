package com.date.backend.domain.report.repository;

import com.date.backend.domain.report.domain.SessionParticipantAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface SessionParticipantAnalysisRepository extends JpaRepository<SessionParticipantAnalysis, Long> {
	@Query("""
			select analysis from SessionParticipantAnalysis analysis
			join analysis.receipt receipt
			where analysis.sessionId = :sessionId
			  and analysis.userId = :userId
			  and receipt.analysisVersion = :analysisVersion
			""")
	Optional<SessionParticipantAnalysis> findBySessionUserAndVersion(
			@Param("sessionId") Long sessionId,
			@Param("userId") Long userId,
			@Param("analysisVersion") String analysisVersion
	);
}
