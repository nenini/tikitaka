package com.date.backend.domain.moderation.integration;

public interface AiSessionTranscriptClient {
	boolean configured();
	AiSessionTranscript getTranscript(Long sessionId);
}
