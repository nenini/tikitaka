package com.date.backend.domain.report.repository;

import com.date.backend.domain.report.domain.VoiceSessionAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface VoiceSessionAnalysisRepository extends JpaRepository<VoiceSessionAnalysis, Long> {
	Optional<VoiceSessionAnalysis> findBySessionIdAndUserIdAndAnalysisVersion(
			Long sessionId, Long userId, String analysisVersion);
	boolean existsBySessionIdAndUserIdAndAnalysisVersion(
			Long sessionId, Long userId, String analysisVersion);
}
