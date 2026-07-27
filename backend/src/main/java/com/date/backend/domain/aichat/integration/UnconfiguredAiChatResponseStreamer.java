package com.date.backend.domain.aichat.integration;

import java.util.function.Consumer;

public class UnconfiguredAiChatResponseStreamer implements AiChatResponseStreamer {
	@Override
	public void stream(
			AiChatResponseStreamRequest request,
			Consumer<String> chunkConsumer
	) {
		throw new IllegalStateException("AI 채팅 서버 연동 구현이 설정되지 않았습니다.");
	}
}
