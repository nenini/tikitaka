package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.dto.request.AiReportResultRequest;
import com.date.backend.domain.report.repository.SessionParticipantAnalysisRepository;
import com.date.backend.domain.report.repository.SessionReportRepository;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.*;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiReportResultServiceTest {
	private final WaitingRoomRepository sessions = mock(WaitingRoomRepository.class);
	private final RoomParticipantRepository participants = mock(RoomParticipantRepository.class);
	private final SessionReportRepository reports = mock(SessionReportRepository.class);
	private final SessionParticipantAnalysisRepository analyses =
			mock(SessionParticipantAnalysisRepository.class);
	private final AiReportResultService service = new AiReportResultService(
			sessions, participants, reports, analyses,
			new ObjectMapper().findAndRegisterModules());

	@Test
	void storesCompletedResult() {
		SessionReport report = new SessionReport(1L, 2L, java.time.LocalDateTime.now());
		when(sessions.findWithMatchPairByIdForUpdate(1L)).thenReturn(Optional.of(mock(WaitingRoom.class)));
		when(participants.existsByRoom_IdAndUserId(1L, 2L)).thenReturn(true);
		when(reports.findBySessionIdAndUserIdForUpdate(1L, 2L)).thenReturn(Optional.of(report));

		var response = service.receive(completedRequest());

		assertThat(response.acceptedCount()).isEqualTo(1);
		assertThat(report.getStatus()).isEqualTo(SessionReportStatus.COMPLETED);
		assertThat(report.getGenerationMode()).isEqualTo(ReportGenerationMode.LLM);
	}

	@Test
	void rejectsFailedResultWithoutFailureReason() {
		var result = new AiReportResultRequest.ParticipantReportResult(
				2L, AiReportResultStatus.FAILED, ReportGenerationMode.NONE, null,
				List.of(), List.of(), List.of(), AiReportFailureCode.INTERNAL_ERROR, null);
		var request = new AiReportResultRequest(1, 1L, "analysis-v1.0.0", "report-v1.0.0",
				OffsetDateTime.now(), List.of(result));
		when(sessions.findWithMatchPairByIdForUpdate(1L)).thenReturn(Optional.of(mock(WaitingRoom.class)));
		when(participants.existsByRoom_IdAndUserId(1L, 2L)).thenReturn(true);

		assertThatThrownBy(() -> service.receive(request))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ReportErrorCode.REPORT_RESULT_CONTRACT_INVALID));
	}

	private AiReportResultRequest completedRequest() {
		var result = new AiReportResultRequest.ParticipantReportResult(
				2L, AiReportResultStatus.COMPLETED, ReportGenerationMode.LLM, "요약",
				List.of("강점"), List.of("개선"), List.of("미션"), null, null);
		return new AiReportResultRequest(1, 1L, "analysis-v1.0.0", "report-v1.0.0",
				OffsetDateTime.parse("2026-08-04T10:30:00+09:00"), List.of(result));
	}
}
