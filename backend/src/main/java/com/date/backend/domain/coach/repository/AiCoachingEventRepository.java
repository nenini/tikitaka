package com.date.backend.domain.coach.repository;

import com.date.backend.domain.coach.domain.AiCoachingEvent;
import com.date.backend.domain.coach.domain.CoachingDeliveryStatus;
import com.date.backend.domain.coach.domain.CoachingType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;

public interface AiCoachingEventRepository
		extends JpaRepository<AiCoachingEvent, String> {

	boolean existsByEventIdOrDeduplicationKey(
			String eventId,
			String deduplicationKey
	);

	boolean existsBySessionIdAndTargetUserIdAndCoachingTypeAndDeliveryStatusAndDeliveredAtGreaterThanEqual(
			Long sessionId,
			Long targetUserId,
			CoachingType coachingType,
			CoachingDeliveryStatus deliveryStatus,
			LocalDateTime deliveredAt
	);
}
