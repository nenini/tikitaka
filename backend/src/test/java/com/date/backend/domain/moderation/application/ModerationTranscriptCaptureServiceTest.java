package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.domain.*;
import com.date.backend.domain.moderation.integration.*;
import com.date.backend.domain.moderation.repository.ModerationReportRepository;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ModerationTranscriptCaptureServiceTest {
	@Test
	void fetchesTranscriptOnceAndAttachesItToAllSessionReports() {
		var reports = mock(ModerationReportRepository.class);
		var client = mock(AiSessionTranscriptClient.class);
		var first = report(1L, 2L);
		var second = report(2L, 1L);
		when(reports.findAllBySessionId(15L)).thenReturn(List.of(first, second));
		when(client.getTranscript(15L)).thenReturn(new AiSessionTranscript(
				15L, "전체 STT 전문", LocalDateTime.of(2026, 8, 3, 15, 30)));

		int captured = new ModerationTranscriptCaptureService(reports, client).capture(15L);

		assertThat(captured).isEqualTo(2);
		assertThat(first.hasTranscriptEvidence()).isTrue();
		assertThat(first.getEvidences().getFirst().getContentText()).isEqualTo("전체 STT 전문");
		assertThat(second.hasTranscriptEvidence()).isTrue();
		verify(client, times(1)).getTranscript(15L);
	}

	@Test
	void skipsAiWhenSessionHasNoPendingReportEvidence() {
		var reports = mock(ModerationReportRepository.class);
		var client = mock(AiSessionTranscriptClient.class);
		when(reports.findAllBySessionId(15L)).thenReturn(List.of());
		assertThat(new ModerationTranscriptCaptureService(reports, client).capture(15L)).isZero();
		verifyNoInteractions(client);
	}

	private ModerationReport report(Long reporterId, Long reportedId) {
		return new ModerationReport(15L, reporterId, reportedId,
				ModerationReportReason.OTHER, "신고 내용", RoomSessionStatus.COMPLETED,
				LocalDateTime.of(2026, 8, 3, 15, 31));
	}
}
