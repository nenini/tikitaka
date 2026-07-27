package com.date.backend.domain.aichat.integration;

public class UnconfiguredAiChatResponseStreamer implements AiChatResponseStreamer {
	@Override
	public void stream(
			AiChatResponseStreamRequest request,
			AiChatResponseStreamListener listener
	) {
		throw new IllegalStateException("AI 채팅 서버 연동 구현이 설정되지 않았습니다.");
	}
}
