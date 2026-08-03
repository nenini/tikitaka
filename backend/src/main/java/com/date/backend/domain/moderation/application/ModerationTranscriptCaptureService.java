package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.integration.AiSessionTranscriptClient;
import com.date.backend.domain.moderation.repository.ModerationReportRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ModerationTranscriptCaptureService {
	private final ModerationReportRepository reportRepository;
	private final AiSessionTranscriptClient transcriptClient;

	public ModerationTranscriptCaptureService(ModerationReportRepository reportRepository,
			AiSessionTranscriptClient transcriptClient) {
		this.reportRepository = reportRepository;
		this.transcriptClient = transcriptClient;
	}

	@Transactional
	public int capture(Long sessionId) {
		var reports = reportRepository.findAllBySessionId(sessionId).stream()
				.filter(report -> !report.hasTranscriptEvidence())
				.toList();
		if (reports.isEmpty()) return 0;
		var transcript = transcriptClient.getTranscript(sessionId);
		reports.forEach(report -> report.addTranscriptEvidence(
				sessionId,
				transcript.transcript(),
				transcript.generatedAt()
		));
		return reports.size();
	}
}
