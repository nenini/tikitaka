package com.date.backend.domain.aichat.integration;

import java.util.function.Consumer;

public interface AiChatResponseStreamer {
	void stream(AiChatResponseStreamRequest request, Consumer<String> chunkConsumer) throws Exception;
}
