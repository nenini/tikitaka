package com.date.backend.domain.coach.integration;

public class AiSessionEventDeliveryException extends RuntimeException {
	private final boolean retryable;

	public AiSessionEventDeliveryException(
			String message,
			boolean retryable
	) {
		super(message);
		this.retryable = retryable;
	}

	public AiSessionEventDeliveryException(
			String message,
			Throwable cause,
			boolean retryable
	) {
		super(message, cause);
		this.retryable = retryable;
	}

	public boolean retryable() {
		return retryable;
	}
}
