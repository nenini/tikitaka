package com.date.backend.domain.moderation.application;

public interface UserBlockPolicy {
	boolean isBlockedBetween(Long firstUserId, Long secondUserId);
}
