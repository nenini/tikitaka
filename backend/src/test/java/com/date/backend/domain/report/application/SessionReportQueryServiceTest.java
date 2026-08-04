package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.repository.*;
import com.date.backend.domain.room.repository.*;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionReportQueryServiceTest {
	private final WaitingRoomRepository sessions = mock(WaitingRoomRepository.class);
	private final RoomParticipantRepository participants = mock(RoomParticipantRepository.class);
	private final SessionReportRepository reports = mock(SessionReportRepository.class);
	private final SessionParticipantAnalysisRepository analyses = mock(SessionParticipantAnalysisRepository.class);
	private final SessionAnalysisEvidenceSegmentRepository evidence = mock(SessionAnalysisEvidenceSegmentRepository.class);
	private final SessionReportQueryService service = new SessionReportQueryService(
			sessions, participants, reports, analyses, evidence,
			new ObjectMapper().findAndRegisterModules());
	private final LocalDateTime now = LocalDateTime.of(2026, 8, 4, 10, 0);

	@Test
	void returnsPendingStateWithoutGeneratedFields() {
		SessionReport report = report(1L, 2L);
		when(sessions.existsById(1L)).thenReturn(true);
		when(participants.existsByRoom_IdAndUserId(1L, 2L)).thenReturn(true);
		when(reports.findBySessionIdAndUserId(1L, 2L)).thenReturn(Optional.of(report));

		var response = service.getBySession(2L, 1L);

		assertThat(response.status()).isEqualTo(SessionReportStatus.PENDING);
		assertThat(response.axes()).isEmpty();
		assertThat(response.strengths()).isEmpty();
		assertThat(response.summaryText()).isNull();
	}

	@Test
	void returnsDetailedCompletedReportWithMetricsAndEvidence() {
		SessionReport report = report(1L, 2L);
		report.complete("analysis-v1.0.0", "report-v1.0.0", "hash",
				ReportGenerationMode.LLM, "요약", List.of("강점"), List.of("개선"),
				List.of("미션"), null, null, now.plusMinutes(1));
		SessionAnalysisReceipt receipt = new SessionAnalysisReceipt(1L, 1, "analysis-v1.0.0",
				"payload", 1800000L, now, now);
		String axesJson = "{\"flow\":{\"score\":4.25,\"measured\":true,\"raw\":2.5,"
				+ "\"rawUnit\":\"COUNT_PER_30_MINUTES\",\"note\":\"근거\"}}";
		String metricsJson = "{\"speakingMs\":500000,\"speakingRatio\":0.5,"
				+ "\"longSilenceCount\":2,\"silenceThresholdMs\":10000,"
				+ "\"interruptionCount\":1,\"backchannelCount\":3,\"fillerCount\":4,"
				+ "\"questionCount\":null,\"smileEpisodeCount\":null,"
				+ "\"gazeAwayCount\":null,\"faceMissingCount\":null,\"visionMeasured\":false}";
		SessionParticipantAnalysis analysis = new SessionParticipantAnalysis(
				receipt, 1L, 2L, AnalysisStatus.COMPLETED, axesJson, metricsJson, now);
		ReflectionTestUtils.setField(analysis, "id", 11L);
		SessionAnalysisEvidenceSegment segment = new SessionAnalysisEvidenceSegment(
				analysis, "e1", AnalysisEvidenceType.LONG_SILENCE, 1000, 12000, "긴 침묵");
		when(reports.findById(10L)).thenReturn(Optional.of(report));
		when(participants.existsByRoom_IdAndUserId(1L, 2L)).thenReturn(true);
		when(analyses.findBySessionUserAndVersion(1L, 2L, "analysis-v1.0.0"))
				.thenReturn(Optional.of(analysis));
		when(evidence.findAllByAnalysis_IdOrderByStartMsAsc(11L)).thenReturn(List.of(segment));

		var response = service.getDetail(2L, 10L);

		assertThat(response.status()).isEqualTo(SessionReportStatus.COMPLETED);
		assertThat(response.axes()).containsKey("flow");
		assertThat(response.metrics().speakingMs()).isEqualTo(500000L);
		assertThat(response.nextMissions()).containsExactly("미션");
		assertThat(response.evidenceSegments()).hasSize(1);
	}

	@Test
	void rejectsAnotherParticipantsReport() {
		SessionReport report = report(1L, 3L);
		when(reports.findById(10L)).thenReturn(Optional.of(report));

		assertThatThrownBy(() -> service.getDetail(2L, 10L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ReportErrorCode.REPORT_ACCESS_DENIED));
	}

	@Test
	void rejectsNonParticipantSessionSummary() {
		when(sessions.existsById(1L)).thenReturn(true);
		when(participants.existsByRoom_IdAndUserId(1L, 2L)).thenReturn(false);

		assertThatThrownBy(() -> service.getBySession(2L, 1L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ReportErrorCode.REPORT_ACCESS_DENIED));
	}

	private SessionReport report(Long sessionId, Long userId) {
		SessionReport report = new SessionReport(sessionId, userId, now);
		ReflectionTestUtils.setField(report, "id", 10L);
		return report;
	}
}
