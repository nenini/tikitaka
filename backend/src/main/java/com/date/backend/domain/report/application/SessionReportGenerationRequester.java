package com.date.backend.domain.report.application;

import com.date.backend.domain.report.integration.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.time.*;
import java.util.concurrent.Executor;

@Component
public class SessionReportGenerationRequester {
	private final SessionReportGenerationService service;
	private final AiReportGenerationClient client;
	private final AiReportGenerationProperties properties;
	private final Executor executor;
	private final Clock clock;

	public SessionReportGenerationRequester(SessionReportGenerationService service,
			AiReportGenerationClient client, AiReportGenerationProperties properties,
			@Qualifier("aiSessionEventExecutor") Executor executor, Clock clock) {
		this.service = service; this.client = client; this.properties = properties;
		this.executor = executor; this.clock = clock;
	}

	public void submit(Long sessionId, LocalDateTime requestedAt) {
		executor.execute(() -> request(sessionId, requestedAt));
	}

	private void request(Long sessionId, LocalDateTime requestedAt) {
		if (!client.configured()) {
			service.markFailed(sessionId, "AI_REPORT_NOT_CONFIGURED",
					"AI 리포트 생성 서버가 설정되지 않았습니다.", LocalDateTime.now(clock));
			return;
		}
		for (int attempt = 1; attempt <= properties.maxAttempts(); attempt++) {
			service.recordAttempt(sessionId, LocalDateTime.now(clock));
			try {
				client.request(AiReportGenerationRequest.of(sessionId,
						requestedAt.atZone(clock.getZone()).toOffsetDateTime()));
				return;
			} catch (AiReportGenerationException exception) {
				if (!exception.retryable() || attempt == properties.maxAttempts()) {
					service.markFailed(sessionId, "AI_REPORT_REQUEST_FAILED", exception.getMessage(), LocalDateTime.now(clock));
					return;
				}
				try { Thread.sleep(properties.retryDelay()); }
				catch (InterruptedException interrupted) {
					Thread.currentThread().interrupt();
					service.markFailed(sessionId, "AI_REPORT_REQUEST_INTERRUPTED",
							"AI 리포트 생성 재시도가 중단되었습니다.", LocalDateTime.now(clock));
					return;
				}
			}
		}
	}
}
