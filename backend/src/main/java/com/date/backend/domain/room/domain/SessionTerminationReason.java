package com.date.backend.domain.room.domain;

public enum SessionTerminationReason {
	NORMAL_COMPLETION,
	USER_REQUEST,
	SAFETY_CONCERN,
	TECHNICAL_ISSUE,
	OTHER,
	TIME_EXPIRED,
	RECONNECT_TIMEOUT
}
