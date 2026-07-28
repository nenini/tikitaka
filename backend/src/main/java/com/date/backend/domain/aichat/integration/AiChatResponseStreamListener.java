package com.date.backend.domain.aichat.integration;

@FunctionalInterface
public interface AiChatResponseStreamListener {
	default void onPersonaSelected(AiChatPersonaSelection persona) {
	}

	void onChunk(String chunk);
}
