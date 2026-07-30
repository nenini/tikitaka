package com.date.backend.domain.safety.dto;

import com.date.backend.domain.safety.domain.SafetyCategory;
import com.date.backend.domain.safety.domain.SafetySeverity;

public record SafetyWarningResponse(
		String eventType,
		String eventId,
		Long sessionId,
		SafetyCategory category,
		SafetySeverity severity,
		String message,
		String recommendedAction,
		int occurrenceCount
) {
	public static final String EVENT_TYPE = "SAFETY_WARNING";
	public static final String CAUTION = "CAUTION";
	public static final String REPORT_OR_LEAVE_OPTIONS = "SHOW_REPORT_OR_LEAVE_OPTIONS";
}
