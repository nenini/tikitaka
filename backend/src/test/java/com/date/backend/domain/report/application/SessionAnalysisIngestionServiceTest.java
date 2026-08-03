package com.date.backend.domain.report.application;

import com.date.backend.domain.report.domain.*;
import com.date.backend.domain.report.dto.request.SessionAnalysisRequest;
import com.date.backend.domain.report.dto.response.SessionAnalysisAcceptedResponse;
import com.date.backend.domain.report.repository.*;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ReportErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SessionAnalysisIngestionServiceTest {
	private final WaitingRoomRepository sessions = mock(WaitingRoomRepository.class);
	private final RoomParticipantRepository participants = mock(RoomParticipantRepository.class);
	private final SessionAnalysisReceiptRepository receipts = mock(SessionAnalysisReceiptRepository.class);
	private final SessionParticipantAnalysisRepository analyses = mock(SessionParticipantAnalysisRepository.class);
	private final SessionAnalysisEvidenceSegmentRepository evidence = mock(SessionAnalysisEvidenceSegmentRepository.class);
	private final SessionAnalysisIngestionService service = new SessionAnalysisIngestionService(
			sessions, participants, receipts, analyses, evidence, new ObjectMapper().findAndRegisterModules(),
			Clock.fixed(Instant.parse("2026-08-03T00:00:00Z"), ZoneId.of("Asia/Seoul"))
	);

	@Test
	void storesValidParticipantAnalysis() {
		SessionAnalysisRequest request = validRequest();
		when(sessions.findWithMatchPairByIdForUpdate(1L))
				.thenAnswer(ignored -> Optional.of(endedSession()));
		when(participants.existsByRoom_IdAndUserId(1L, 10L)).thenReturn(true);
		when(receipts.findBySessionIdAndAnalysisVersion(1L, "analysis-v1.0.0")).thenReturn(Optional.empty());
		when(receipts.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
		when(analyses.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

		SessionAnalysisAcceptedResponse response = service.receive(request);

		assertThat(response.duplicate()).isFalse();
		assertThat(response.receivedParticipantCount()).isEqualTo(1);
		verify(receipts).save(any(SessionAnalysisReceipt.class));
		verify(analyses).save(any(SessionParticipantAnalysis.class));
	}

	@Test
	void returnsDuplicateWithoutSavingAgain() {
		SessionAnalysisRequest request = validRequest();
		when(sessions.findWithMatchPairByIdForUpdate(1L))
				.thenAnswer(ignored -> Optional.of(endedSession()));
		SessionAnalysisReceipt existing = mock(SessionAnalysisReceipt.class);
		when(existing.getSessionId()).thenReturn(1L);
		when(existing.getAnalysisVersion()).thenReturn("analysis-v1.0.0");
		when(receipts.findBySessionIdAndAnalysisVersion(1L, "analysis-v1.0.0"))
				.thenReturn(Optional.of(existing));

		// Obtain the expected hash through an initial invocation against a capture repository.
		when(existing.getPayloadHash()).thenReturn(hashViaFreshService(request));
		SessionAnalysisAcceptedResponse response = service.receive(request);

		assertThat(response.duplicate()).isTrue();
		verify(receipts, never()).save(any());
	}

	@Test
	void rejectsNonParticipant() {
		when(sessions.findWithMatchPairByIdForUpdate(1L))
				.thenAnswer(ignored -> Optional.of(endedSession()));
		when(receipts.findBySessionIdAndAnalysisVersion(anyLong(), anyString())).thenReturn(Optional.empty());
		when(participants.existsByRoom_IdAndUserId(1L, 10L)).thenReturn(false);

		assertThatThrownBy(() -> service.receive(validRequest()))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ReportErrorCode.ANALYSIS_PARTICIPANT_NOT_FOUND));
	}

	@Test
	void rejectsVisionCountsWhenVisionWasNotMeasured() {
		SessionAnalysisRequest base = validRequest();
		SessionAnalysisRequest.MetricsRequest invalidMetrics = new SessionAnalysisRequest.MetricsRequest(
				100L, new BigDecimal("0.5"), 1, 10000, 1, 1, 1, null, 0, null, null, false);
		SessionAnalysisRequest.ParticipantAnalysisRequest invalidParticipant =
				new SessionAnalysisRequest.ParticipantAnalysisRequest(10L, AnalysisStatus.COMPLETED,
						base.participants().getFirst().axes(), invalidMetrics, List.of());
		SessionAnalysisRequest invalid = new SessionAnalysisRequest(1, "analysis-v1.0.0", 1L,
				base.analyzedAt(), List.of(invalidParticipant));
		when(sessions.findWithMatchPairByIdForUpdate(1L))
				.thenAnswer(ignored -> Optional.of(endedSession()));
		when(participants.existsByRoom_IdAndUserId(1L, 10L)).thenReturn(true);
		when(receipts.findBySessionIdAndAnalysisVersion(anyLong(), anyString())).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.receive(invalid))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ReportErrorCode.ANALYSIS_CONTRACT_INVALID));
	}

	private String hashViaFreshService(SessionAnalysisRequest request) {
		try {
			String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(request);
			byte[] bytes = java.security.MessageDigest.getInstance("SHA-256")
					.digest(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
			return java.util.HexFormat.of().formatHex(bytes);
		} catch (Exception exception) { throw new AssertionError(exception); }
	}

	private SessionAnalysisRequest validRequest() {
		Map<String, SessionAnalysisRequest.AxisMetricRequest> axes = new LinkedHashMap<>();
		for (String name : List.of("flow", "question", "listening", "reaction", "balance", "nonverbal")) {
			boolean measured = !name.equals("question");
			axes.put(name, new SessionAnalysisRequest.AxisMetricRequest(
					measured ? new BigDecimal("4.00") : null, measured,
					measured ? BigDecimal.ONE : null,
					measured ? AnalysisRawUnit.COUNT_PER_30_MINUTES : null, "근거"));
		}
		SessionAnalysisRequest.MetricsRequest metrics = new SessionAnalysisRequest.MetricsRequest(
				500L, new BigDecimal("0.5"), 1, 10000, 1, 1, 1, null, null, null, null, false);
		return new SessionAnalysisRequest(1, "analysis-v1.0.0", 1L,
				OffsetDateTime.parse("2026-08-03T09:00:00+09:00"),
				List.of(new SessionAnalysisRequest.ParticipantAnalysisRequest(
						10L, AnalysisStatus.COMPLETED, axes, metrics, List.of())));
	}

	private WaitingRoom endedSession() {
		WaitingRoom session = mock(WaitingRoom.class);
		when(session.getActualStartAt()).thenReturn(LocalDateTime.of(2026, 8, 3, 9, 0));
		when(session.getActualEndAt()).thenReturn(LocalDateTime.of(2026, 8, 3, 9, 30));
		return session;
	}
}
