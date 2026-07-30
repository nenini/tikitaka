package com.date.backend.domain.safety.repository;

import com.date.backend.domain.safety.domain.SafetyCategory;
import com.date.backend.domain.safety.domain.SafetyEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SafetyEventRepository extends JpaRepository<SafetyEvent, String> {
	boolean existsByEventIdOrDeduplicationKey(
			String eventId,
			String deduplicationKey
	);

	long countBySessionIdAndUserIdAndCategory(
			Long sessionId,
			Long userId,
			SafetyCategory category
	);
}
