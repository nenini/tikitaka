package com.date.backend.global.config;

import org.junit.jupiter.api.Test;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class AiChatAsyncConfigTest {

	@Test
	void aiChatStreamExecutorRunsEachTaskOnVirtualThread() throws Exception {
		AiChatAsyncConfig config = new AiChatAsyncConfig();
		ExecutorService executor = config.aiChatStreamExecutor();

		try {
			ThreadSnapshot snapshot = executor.submit(() -> new ThreadSnapshot(
					Thread.currentThread().isVirtual(),
					Thread.currentThread().getName()
			)).get(1, TimeUnit.SECONDS);

			assertThat(snapshot.virtual()).isTrue();
			assertThat(snapshot.name()).startsWith("ai-chat-stream-vt-");
		} finally {
			executor.shutdownNow();
		}
	}

	private record ThreadSnapshot(boolean virtual, String name) {
	}
}
