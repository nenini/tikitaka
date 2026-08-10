package com.date.backend.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;

@Configuration
public class AiChatAsyncConfig {

	@Bean(name = "aiChatStreamExecutor", destroyMethod = "shutdownNow")
	public ExecutorService aiChatStreamExecutor() {
		ThreadFactory threadFactory = Thread.ofVirtual()
				.name("ai-chat-stream-vt-", 0)
				.factory();
		return Executors.newThreadPerTaskExecutor(threadFactory);
	}
}
