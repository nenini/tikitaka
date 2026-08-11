package com.date.backend.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
public class AiChatAsyncConfig {
	@Bean(name = "aiChatStreamExecutor")
	public Executor aiChatStreamExecutor() {
		ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
		executor.setCorePoolSize(4);
		executor.setMaxPoolSize(16);
		// GPU 작업 대기열은 AI 서버 한 곳에서만 관리합니다.
		executor.setQueueCapacity(0);
		executor.setThreadNamePrefix("ai-chat-stream-");
		executor.setWaitForTasksToCompleteOnShutdown(false);
		executor.initialize();
		return executor;
	}
}
