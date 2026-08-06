package com.date.backend.domain.report.application;

import com.date.backend.domain.report.dto.request.VoiceSessionAnalysisRequest;
import com.date.backend.domain.report.dto.request.VoiceSessionReportRequest;
import com.date.backend.domain.report.repository.VoiceSessionAnalysisRepository;
import com.date.backend.domain.report.repository.VoiceSessionReportRepository;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class VoiceSessionResultServiceTest {
	private final WaitingRoomRepository sessionRepository = mock(WaitingRoomRepository.class);
	private final RoomParticipantRepository participantRepository = mock(RoomParticipantRepository.class);
	private final VoiceSessionAnalysisRepository analysisRepository = mock(VoiceSessionAnalysisRepository.class);
	private final VoiceSessionReportRepository reportRepository = mock(VoiceSessionReportRepository.class);
	private final VoiceSessionResultService service = new VoiceSessionResultService(
			sessionRepository, participantRepository, analysisRepository, reportRepository,
			new ObjectMapper().findAndRegisterModules(),
			Clock.fixed(Instant.parse("2026-08-05T06:00:00Z"), ZoneOffset.UTC));

	@Test
	void storesObjectiveMetricsBeforeNarrativeReport() {
		WaitingRoom session = mock(WaitingRoom.class);
		when(session.isAiVideo()).thenReturn(true);
		when(sessionRepository.findByIdForUpdate(123L)).thenReturn(Optional.of(session));
		when(participantRepository.existsByRoom_IdAndUserId(123L, 1001L)).thenReturn(true);
		when(analysisRepository.findBySessionIdAndUserIdAndAnalysisVersion(
				123L, 1001L, "voice-analysis-v1.0.0")).thenReturn(Optional.empty());
		when(analysisRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

		var response = service.receiveAnalysis(analysisRequest());

		assertThat(response.duplicate()).isFalse();
		verify(analysisRepository).save(any());
	}

	@Test
	void storesReportOnlyAfterMatchingAnalysisExists() {
		WaitingRoom session = mock(WaitingRoom.class);
		when(session.isAiVideo()).thenReturn(true);
		when(sessionRepository.findByIdForUpdate(123L)).thenReturn(Optional.of(session));
		when(participantRepository.existsByRoom_IdAndUserId(123L, 1001L)).thenReturn(true);
		when(analysisRepository.existsBySessionIdAndUserIdAndAnalysisVersion(
				123L, 1001L, "voice-analysis-v1.0.0")).thenReturn(true);
		when(reportRepository.findBySessionIdAndUserIdAndReportVersion(
				123L, 1001L, "voice-report-v1.0.0")).thenReturn(Optional.empty());
		when(reportRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

		var response = service.receiveReport(new VoiceSessionReportRequest(
				1, "voice-analysis-v1.0.0", "voice-report-v1.0.0", 123L, 1001L,
				OffsetDateTime.parse("2026-08-05T15:00:00+09:00"),
				"COMPLETED", "RULE_BASED", "요약", List.of("노트"), "다음 미션"));

		assertThat(response.duplicate()).isFalse();
		verify(reportRepository).save(any());
	}

	private VoiceSessionAnalysisRequest analysisRequest() {
		return new VoiceSessionAnalysisRequest(
				1, "voice-analysis-v1.0.0", 123L, 1001L, 300_000L,
				OffsetDateTime.parse("2026-08-05T15:00:00+09:00"),
				new VoiceSessionAnalysisRequest.Metrics(
						130_000L, 15, new BigDecimal("8666.7"), new BigDecimal("3200.0"),
						12, 12, Map.of("뭐", 6, "그니까", 4, "음", 2), 14, 2, 1));
	}
}
