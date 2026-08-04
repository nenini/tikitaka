package com.date.backend.domain.report.domain;

import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

class SessionReportTest {
	private final LocalDateTime now = LocalDateTime.of(2026, 8, 4, 10, 0);

	@Test
	void transitionsFromPendingToGeneratingAndCompleted() {
		SessionReport report = new SessionReport(1L, 2L, now);
		report.recordAttempt(now.plusSeconds(1));
		report.markGenerating(now.plusSeconds(2));

		boolean changed = report.complete("analysis-v1.0.0", "report-v1.0.0", "hash",
				ReportGenerationMode.LLM, "요약", List.of("강점"), List.of("개선"),
				List.of("미션"), null, null, now.plusMinutes(1));

		assertThat(changed).isTrue();
		assertThat(report.getStatus()).isEqualTo(SessionReportStatus.COMPLETED);
		assertThat(report.getAttemptCount()).isEqualTo(1);
		assertThat(report.getStrengths()).containsExactly("강점");
	}

	@Test
	void identicalCompletedResultIsIdempotentButDifferentHashConflicts() {
		SessionReport report = new SessionReport(1L, 2L, now);
		report.complete("analysis-v1.0.0", "report-v1.0.0", "same",
				ReportGenerationMode.LLM, "요약", List.of(), List.of(), List.of(), null, null, now);

		assertThat(report.complete("analysis-v1.0.0", "report-v1.0.0", "same",
				ReportGenerationMode.LLM, "요약", List.of(), List.of(), List.of(), null, null, now)).isFalse();
		assertThatThrownBy(() -> report.complete("analysis-v1.0.0", "report-v1.0.0", "different",
				ReportGenerationMode.LLM, "다른 요약", List.of(), List.of(), List.of(), null, null, now))
				.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void recordsRequestFailureReason() {
		SessionReport report = new SessionReport(1L, 2L, now);
		report.markRequestFailed("AI_REPORT_REQUEST_FAILED", "연결 실패", now.plusSeconds(3));
		assertThat(report.getStatus()).isEqualTo(SessionReportStatus.FAILED);
		assertThat(report.getFailureCode()).isEqualTo("AI_REPORT_REQUEST_FAILED");
	}
}
