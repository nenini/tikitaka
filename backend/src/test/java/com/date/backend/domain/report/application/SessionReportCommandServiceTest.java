package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.repository.SessionReportRepository;
import com.date.backend.domain.room.repository.*;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionReportCommandServiceTest {
	private final WaitingRoomRepository sessions = mock(WaitingRoomRepository.class);
	private final RoomParticipantRepository participants = mock(RoomParticipantRepository.class);
	private final SessionReportRepository reports = mock(SessionReportRepository.class);
	private final SessionReportGenerationService generation = mock(SessionReportGenerationService.class);
	private final SessionReportCommandService service = new SessionReportCommandService(
			sessions, participants, reports, generation,
			Clock.fixed(Instant.parse("2026-08-04T01:00:00Z"), ZoneId.of("Asia/Seoul")));

	@Test
	void deletesOnlyOwnedCompletedReport() {
		SessionReport report = completedReport();
		when(reports.findById(10L)).thenReturn(java.util.Optional.of(report));
		when(participants.existsByRoom_IdAndUserId(1L, 2L)).thenReturn(true);

		var response = service.delete(2L, 10L);

		assertThat(response.deleted()).isTrue();
		verify(reports).delete(report);
	}

	@Test
	void rejectsDeletingGeneratingReport() {
		SessionReport report = new SessionReport(1L, 2L, LocalDateTime.now());
		ReflectionTestUtils.setField(report, "id", 10L);
		report.markGenerating(LocalDateTime.now());
		when(reports.findById(10L)).thenReturn(java.util.Optional.of(report));
		when(participants.existsByRoom_IdAndUserId(1L, 2L)).thenReturn(true);

		assertThatThrownBy(() -> service.delete(2L, 10L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ReportErrorCode.REPORT_DELETE_IN_PROGRESS));
		verify(reports, never()).delete(any());
	}

	private SessionReport completedReport() {
		LocalDateTime now = LocalDateTime.now();
		SessionReport report = new SessionReport(1L, 2L, now);
		ReflectionTestUtils.setField(report, "id", 10L);
		report.complete("analysis-v1.0.0", "report-v1.0.0", "hash", ReportGenerationMode.LLM,
				"summary", java.util.List.of(), java.util.List.of(), java.util.List.of(), null, null, now);
		return report;
	}
}
