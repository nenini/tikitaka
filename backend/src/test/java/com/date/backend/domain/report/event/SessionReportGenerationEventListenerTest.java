package com.date.backend.domain.report.event;

import com.date.backend.domain.report.application.SessionReportGenerationService;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.event.AiSessionEndedEvent;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SessionReportGenerationEventListenerTest {
	@Test
	void preparesPushTargetWithoutCallingMissingAiGenerateEndpoint() {
		SessionReportGenerationService service = mock(SessionReportGenerationService.class);
		Clock clock = Clock.fixed(
				Instant.parse("2026-08-04T01:00:00Z"),
				ZoneId.of("Asia/Seoul")
		);
		var listener = new SessionReportGenerationEventListener(service, clock);

		listener.handle(AiSessionEndedEvent.of(
				1L,
				Instant.now(clock),
				SessionTerminationReason.NORMAL_COMPLETION
		));

		verify(service).prepare(eq(1L), any(LocalDateTime.class));
	}
}
