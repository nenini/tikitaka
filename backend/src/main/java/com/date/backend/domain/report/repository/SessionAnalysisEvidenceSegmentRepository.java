package com.date.backend.domain.report.repository;

import com.date.backend.domain.report.domain.SessionAnalysisEvidenceSegment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SessionAnalysisEvidenceSegmentRepository extends JpaRepository<SessionAnalysisEvidenceSegment, Long> {
	List<SessionAnalysisEvidenceSegment> findAllByAnalysis_IdOrderByStartMsAsc(Long analysisId);
}
