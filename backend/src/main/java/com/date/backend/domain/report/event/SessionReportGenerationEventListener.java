package com.date.backend.domain.report.event;

import com.date.backend.domain.report.application.SessionReportGenerationService;
import com.date.backend.domain.report.integration.*;
import com.date.backend.domain.room.event.AiSessionEndedEvent;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;

import java.time.*;
import java.util.concurrent.Executor;

@Component
public class SessionReportGenerationEventListener {
	private static final Logger log = LoggerFactory.getLogger(SessionReportGenerationEventListener.class);
	private final SessionReportGenerationService service;
	private final AiReportGenerationClient client;
	private final AiReportGenerationProperties properties;
	private final Executor executor;
	private final Clock clock;

	public SessionReportGenerationEventListener(SessionReportGenerationService service,
			AiReportGenerationClient client, AiReportGenerationProperties properties,
			@Qualifier("aiSessionEventExecutor") Executor executor, Clock clock) {
		this.service = service; this.client = client; this.properties = properties;
		this.executor = executor; this.clock = clock;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void handle(AiSessionEndedEvent event) {
		Long sessionId;
		try { sessionId = Long.valueOf(event.sessionId()); }
		catch (NumberFormatException exception) {
			log.error("Invalid session id in report generation event: {}", event.sessionId()); return;
		}
		LocalDateTime requestedAt = LocalDateTime.now(clock);
		try {
			if (!service.prepare(sessionId, requestedAt)) {
				log.info("AI report generation already prepared. sessionId={}", sessionId); return;
			}
		} catch (RuntimeException exception) {
			log.error("AI report preparation failed. sessionId={}", sessionId, exception); return;
		}
		executor.execute(() -> request(sessionId, requestedAt));
	}

	private void request(Long sessionId, LocalDateTime requestedAt) {
		if (!client.configured()) {
			service.markFailed(sessionId, "AI_REPORT_NOT_CONFIGURED",
					"AI 리포트 생성 서버가 설정되지 않았습니다.", LocalDateTime.now(clock));
			return;
		}
		for (int attempt = 1; attempt <= properties.maxAttempts(); attempt++) {
			LocalDateTime attemptedAt = LocalDateTime.now(clock);
			service.recordAttempt(sessionId, attemptedAt);
			try {
				client.request(AiReportGenerationRequest.of(sessionId,
						requestedAt.atZone(clock.getZone()).toOffsetDateTime()));
				service.markGenerating(sessionId, LocalDateTime.now(clock));
				log.info("AI report generation requested. sessionId={}, attempt={}", sessionId, attempt);
				return;
			} catch (AiReportGenerationException exception) {
				if (!exception.retryable() || attempt == properties.maxAttempts()) {
					service.markFailed(sessionId, "AI_REPORT_REQUEST_FAILED",
							exception.getMessage(), LocalDateTime.now(clock));
					log.error("AI report generation request failed. sessionId={}, attempt={}",
							sessionId, attempt, exception);
					return;
				}
				if (!waitBeforeRetry()) {
					service.markFailed(sessionId, "AI_REPORT_REQUEST_INTERRUPTED",
							"AI 리포트 생성 재시도가 중단되었습니다.", LocalDateTime.now(clock));
					return;
				}
			}
		}
	}

	private boolean waitBeforeRetry() {
		try { Thread.sleep(properties.retryDelay()); return true; }
		catch (InterruptedException exception) { Thread.currentThread().interrupt(); return false; }
	}
}
