package com.date.backend.domain.match.scheduler;

import com.date.backend.domain.match.application.ClaimedMatchJob;
import com.date.backend.domain.match.application.MatchJobClaimService;
import com.date.backend.domain.match.application.MatchJobFailureService;
import com.date.backend.domain.match.application.MatchJobProcessor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Component
@ConditionalOnProperty(
		prefix = "match.worker",
		name = "enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class MatchJobWorker {

	private static final Logger log = LoggerFactory.getLogger(MatchJobWorker.class);

	private final MatchJobClaimService claimService;
	private final MatchJobProcessor processor;
	private final MatchJobFailureService failureService;
	private final Clock clock;
	private final String workerId = "match-worker-" + UUID.randomUUID();

	public MatchJobWorker(
			MatchJobClaimService claimService,
			MatchJobProcessor processor,
			MatchJobFailureService failureService,
			Clock clock
	) {
		this.claimService = claimService;
		this.processor = processor;
		this.failureService = failureService;
		this.clock = clock;
	}

	@Scheduled(
			fixedDelayString = "${match.worker.fixed-delay-ms:1000}",
			initialDelayString = "${match.worker.initial-delay-ms:10000}"
	)
	public void processJobs() {
		List<ClaimedMatchJob> jobs = claimService.claim(
				workerId,
				LocalDateTime.now(clock)
		);
		for (ClaimedMatchJob job : jobs) {
			process(job);
		}
	}

	private void process(ClaimedMatchJob job) {
		try {
			processor.process(job.jobId(), workerId);
		} catch (Exception exception) {
			log.warn(
					"Match job failed. jobId={}, matchRequestId={}",
					job.jobId(),
					job.matchRequestId(),
					exception
			);
			failureService.fail(
					job.jobId(),
					workerId,
					exception.getMessage(),
					LocalDateTime.now(clock)
			);
		}
	}
}
