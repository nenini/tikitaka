package com.date.backend.domain.report.domain;

public enum AiReportFailureCode {
	INSUFFICIENT_ANALYSIS_DATA,
	LLM_UNAVAILABLE,
	NO_UTTERANCE,
	ANALYSIS_FAILED,
	SESSION_TOO_SHORT,
	INTERNAL_ERROR
}
