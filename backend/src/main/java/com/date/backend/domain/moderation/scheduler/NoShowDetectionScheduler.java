package com.date.backend.domain.moderation.scheduler;

import com.date.backend.domain.moderation.application.NoShowService;
import com.date.backend.domain.moderation.config.NoShowPolicyProperties;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;

@Component
@ConditionalOnProperty(
		prefix = "moderation.no-show.scheduler",
		name = "enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class NoShowDetectionScheduler {
	private static final Logger log = LoggerFactory.getLogger(NoShowDetectionScheduler.class);

	private final WaitingRoomRepository sessionRepository;
	private final NoShowService noShowService;
	private final NoShowPolicyProperties properties;
	private final Clock clock;
	private final int batchSize;

	public NoShowDetectionScheduler(
			WaitingRoomRepository sessionRepository,
			NoShowService noShowService,
			NoShowPolicyProperties properties,
			Clock clock,
			@Value("${moderation.no-show.scheduler.batch-size:100}") int batchSize
	) {
		this.sessionRepository = sessionRepository;
		this.noShowService = noShowService;
		this.properties = properties;
		this.clock = clock;
		this.batchSize = Math.max(1, batchSize);
	}

	@Scheduled(
			fixedDelayString = "${moderation.no-show.scheduler.fixed-delay-ms:30000}",
			initialDelayString = "${moderation.no-show.scheduler.initial-delay-ms:10000}"
	)
	public void detectNoShows() {
		LocalDateTime deadline = LocalDateTime.now(clock).minus(properties.gracePeriod());
		var candidateIds = sessionRepository.findNoShowCandidateIds(
				deadline, PageRequest.of(0, batchSize));

		for (Long sessionId : candidateIds) {
			try {
				int recorded = noShowService.recordAutomatically(sessionId);
				if (recorded > 0) {
					log.info("Automatically recorded no-show. sessionId={}, count={}",
							sessionId, recorded);
				}
			} catch (RuntimeException exception) {
				log.error("Automatic no-show detection failed. sessionId={}",
						sessionId, exception);
			}
		}
	}
}
