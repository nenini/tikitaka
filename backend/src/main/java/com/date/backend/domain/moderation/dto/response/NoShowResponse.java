package com.date.backend.domain.moderation.dto.response;

import java.time.LocalDateTime;

public record NoShowResponse(Long sessionId, Long noShowUserId, long accumulatedNoShowCount,
		LocalDateTime recordedAt, LocalDateTime restrictionStartsAt,
		LocalDateTime restrictionEndsAt, boolean alreadyRecorded) {}
