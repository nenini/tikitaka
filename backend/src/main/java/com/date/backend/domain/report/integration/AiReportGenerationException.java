package com.date.backend.domain.report.integration;

public class AiReportGenerationException extends RuntimeException {
	private final boolean retryable;
	public AiReportGenerationException(String message, boolean retryable) {
		super(message); this.retryable = retryable;
	}
	public AiReportGenerationException(String message, Throwable cause, boolean retryable) {
		super(message, cause); this.retryable = retryable;
	}
	public boolean retryable() { return retryable; }
}
