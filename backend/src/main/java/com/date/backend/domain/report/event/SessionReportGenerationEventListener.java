package com.date.backend.domain.report.event;

import com.date.backend.domain.report.application.SessionReportGenerationService;
import com.date.backend.domain.room.event.AiSessionEndedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.LocalDateTime;

@Component
public class SessionReportGenerationEventListener {
	private static final Logger log = LoggerFactory.getLogger(SessionReportGenerationEventListener.class);

	private final SessionReportGenerationService service;
	private final Clock clock;

	public SessionReportGenerationEventListener(
			SessionReportGenerationService service,
			Clock clock
	) {
		this.service = service;
		this.clock = clock;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(AiSessionEndedEvent event) {
		Long sessionId;
		try {
			sessionId = Long.valueOf(event.sessionId());
		} catch (NumberFormatException exception) {
			log.error("Invalid session id in report preparation event: {}", event.sessionId());
			return;
		}

		try {
			boolean prepared = service.prepare(sessionId, LocalDateTime.now(clock));
			log.info("AI report push target prepared. sessionId={}, created={}", sessionId, prepared);
		} catch (RuntimeException exception) {
			log.error("AI report push target preparation failed. sessionId={}", sessionId, exception);
		}
	}
}
