package com.date.backend.domain.silence.repository;

import com.date.backend.domain.silence.domain.QuestionRecommendationEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionRecommendationEventRepository
		extends JpaRepository<QuestionRecommendationEvent, String> {
	boolean existsByEventIdOrDeduplicationKey(
			String eventId,
			String deduplicationKey
	);
}
