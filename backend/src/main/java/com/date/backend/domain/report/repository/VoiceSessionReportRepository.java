package com.date.backend.domain.report.repository;

import com.date.backend.domain.report.domain.VoiceSessionReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface VoiceSessionReportRepository extends JpaRepository<VoiceSessionReport, Long> {
	Optional<VoiceSessionReport> findBySessionIdAndUserIdAndReportVersion(
			Long sessionId, Long userId, String reportVersion);
}
