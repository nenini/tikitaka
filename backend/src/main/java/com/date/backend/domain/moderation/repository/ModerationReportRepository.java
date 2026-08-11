package com.date.backend.domain.moderation.repository;

import com.date.backend.domain.moderation.domain.ModerationReport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ModerationReportRepository
		extends JpaRepository<ModerationReport, Long> {

	boolean existsBySessionIdAndReporterUserIdAndReportedUserId(
			Long sessionId,
			Long reporterUserId,
			Long reportedUserId
	);

	boolean existsBySessionId(Long sessionId);

	List<ModerationReport> findAllBySessionId(Long sessionId);
}
