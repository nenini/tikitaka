package com.date.backend.domain.report.event;

import com.date.backend.domain.report.application.SessionReportGenerationService;
import com.date.backend.domain.report.integration.*;
import com.date.backend.domain.room.event.AiSessionEndedEvent;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.concurrent.Executor;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SessionReportGenerationEventListenerTest {
	@Test
	void preparesAndRequestsReportAfterSessionEnd() {
		SessionReportGenerationService service = mock(SessionReportGenerationService.class);
		AiReportGenerationClient client = mock(AiReportGenerationClient.class);
		when(service.prepare(eq(1L), any())).thenReturn(true);
		when(client.configured()).thenReturn(true);
		AiReportGenerationProperties properties = new AiReportGenerationProperties(
				"http://ai", "/generate", Duration.ofSeconds(1), Duration.ofSeconds(1),
				3, Duration.ofMillis(1), Duration.ofMinutes(5), 100);
		Executor direct = Runnable::run;
		Clock clock = Clock.fixed(Instant.parse("2026-08-04T01:00:00Z"), ZoneId.of("Asia/Seoul"));
		var listener = new SessionReportGenerationEventListener(service, client, properties, direct, clock);

		listener.handle(AiSessionEndedEvent.of(1L, Instant.now(), SessionTerminationReason.NORMAL_COMPLETION));

		verify(service).recordAttempt(eq(1L), any());
		verify(client).request(any(AiReportGenerationRequest.class));
		verify(service).markGenerating(eq(1L), any());
	}

	@Test
	void recordsFailureWhenAiIsNotConfigured() {
		SessionReportGenerationService service = mock(SessionReportGenerationService.class);
		AiReportGenerationClient client = mock(AiReportGenerationClient.class);
		when(service.prepare(eq(1L), any())).thenReturn(true);
		when(client.configured()).thenReturn(false);
		AiReportGenerationProperties properties = new AiReportGenerationProperties(
				"", "/generate", Duration.ofSeconds(1), Duration.ofSeconds(1),
				3, Duration.ofMillis(1), Duration.ofMinutes(5), 100);
		var listener = new SessionReportGenerationEventListener(service, client, properties,
				Runnable::run, Clock.systemDefaultZone());

		listener.handle(AiSessionEndedEvent.of(1L, Instant.now(), SessionTerminationReason.NORMAL_COMPLETION));

		verify(service).markFailed(eq(1L), eq("AI_REPORT_NOT_CONFIGURED"), anyString(), any());
		verify(client).configured();
		verify(client, never()).request(any());
	}
}
