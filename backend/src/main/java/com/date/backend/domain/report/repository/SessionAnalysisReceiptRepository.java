package com.date.backend.domain.report.repository;

import com.date.backend.domain.report.domain.SessionAnalysisReceipt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SessionAnalysisReceiptRepository extends JpaRepository<SessionAnalysisReceipt, Long> {
	Optional<SessionAnalysisReceipt> findBySessionIdAndAnalysisVersion(Long sessionId, String analysisVersion);
}
