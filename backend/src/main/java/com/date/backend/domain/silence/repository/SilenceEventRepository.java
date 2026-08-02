package com.date.backend.domain.silence.repository;

import com.date.backend.domain.silence.domain.SilenceEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SilenceEventRepository extends JpaRepository<SilenceEvent, String> {
	boolean existsBySessionIdAndSilenceStartedElapsedMsAndInterventionStage(
			Long sessionId,
			long silenceStartedElapsedMs,
			com.date.backend.domain.silence.domain.SilenceInterventionStage stage
	);
}
