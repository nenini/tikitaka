package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.integration.AiSessionTranscriptClient;
import com.date.backend.domain.moderation.integration.AiTranscriptProperties;
import com.date.backend.domain.moderation.repository.ModerationReportRepository;
import com.date.backend.domain.room.event.AiSessionEndedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.concurrent.Executor;

@Component
public class ModerationTranscriptEventListener {
	private static final Logger log = LoggerFactory.getLogger(ModerationTranscriptEventListener.class);
	private final ModerationReportRepository reportRepository;
	private final ModerationTranscriptCaptureService captureService;
	private final AiSessionTranscriptClient transcriptClient;
	private final AiTranscriptProperties properties;
	private final Executor executor;

	public ModerationTranscriptEventListener(ModerationReportRepository reportRepository,
			ModerationTranscriptCaptureService captureService,
			AiSessionTranscriptClient transcriptClient,
			AiTranscriptProperties properties,
			@Qualifier("aiSessionEventExecutor") Executor executor) {
		this.reportRepository = reportRepository; this.captureService = captureService;
		this.transcriptClient = transcriptClient; this.properties = properties; this.executor = executor;
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void onSessionEnded(AiSessionEndedEvent event) {
		requestCapture(Long.valueOf(event.sessionId()));
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void onLateReport(ModerationTranscriptRequestedEvent event) {
		requestCapture(event.sessionId());
	}

	private void requestCapture(Long sessionId) {
		if (!reportRepository.existsBySessionId(sessionId)) {
			log.debug("STT capture skipped because session has no reports. sessionId={}", sessionId);
			return;
		}
		if (!transcriptClient.configured()) {
			log.error("STT capture skipped because AI transcript client is not configured. sessionId={}", sessionId);
			return;
		}
		executor.execute(() -> captureWithRetry(sessionId));
	}

	private void captureWithRetry(Long sessionId) {
		for (int attempt = 1; attempt <= properties.maxAttempts(); attempt++) {
			try {
				int count = captureService.capture(sessionId);
				log.info("Moderation STT captured. sessionId={}, reports={}, attempt={}", sessionId, count, attempt);
				return;
			} catch (RuntimeException exception) {
				if (attempt == properties.maxAttempts()) {
					log.error("Moderation STT capture failed. sessionId={}, attempts={}", sessionId, attempt, exception);
					return;
				}
				if (!waitBeforeRetry()) return;
			}
		}
	}

	private boolean waitBeforeRetry() {
		try {
			Thread.sleep(properties.retryDelay());
			return true;
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			return false;
		}
	}
}
