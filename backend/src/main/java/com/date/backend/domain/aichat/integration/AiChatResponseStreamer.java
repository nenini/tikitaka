package com.date.backend.domain.aichat.integration;

public interface AiChatResponseStreamer {
	void stream(
			AiChatResponseStreamRequest request,
			AiChatResponseStreamListener listener
	) throws Exception;
}
