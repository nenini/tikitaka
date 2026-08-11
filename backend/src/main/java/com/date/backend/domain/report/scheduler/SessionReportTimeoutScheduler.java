package com.date.backend.domain.report.scheduler;

import com.date.backend.domain.report.application.SessionReportGenerationService;
import com.date.backend.domain.report.integration.AiReportGenerationProperties;
import org.slf4j.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.*;

@Component
public class SessionReportTimeoutScheduler {
	private static final Logger log = LoggerFactory.getLogger(SessionReportTimeoutScheduler.class);
	private final SessionReportGenerationService service;
	private final AiReportGenerationProperties properties;
	private final Clock clock;

	public SessionReportTimeoutScheduler(SessionReportGenerationService service,
			AiReportGenerationProperties properties, Clock clock) {
		this.service = service; this.properties = properties; this.clock = clock;
	}

	@Scheduled(
			fixedDelayString = "${ai.report.timeout-monitor-fixed-delay-ms:30000}",
			initialDelayString = "${ai.report.timeout-monitor-initial-delay-ms:30000}"
	)
	public void expireTimedOutReports() {
		LocalDateTime now = LocalDateTime.now(clock);
		int expired = service.expireTimedOut(now.minus(properties.generationTimeout()),
				now, properties.timeoutBatchSize());
		if (expired > 0) log.warn("Timed out AI reports marked FAILED. count={}", expired);
	}
}
