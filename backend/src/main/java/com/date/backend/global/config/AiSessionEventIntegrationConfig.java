package com.date.backend.global.config;

import com.date.backend.domain.coach.integration.AiSessionEventClient;
import com.date.backend.domain.coach.integration.AiSessionEventProperties;
import com.date.backend.domain.coach.integration.HttpAiSessionEventClient;
import com.date.backend.domain.coach.integration.UnconfiguredAiSessionEventClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableConfigurationProperties(AiSessionEventProperties.class)
public class AiSessionEventIntegrationConfig {
	@Bean
	public AiSessionEventClient aiSessionEventClient(
			AiSessionEventProperties properties,
			ObjectMapper objectMapper
	) {
		if (properties.configured()) {
			return new HttpAiSessionEventClient(properties, objectMapper);
		}
		return new UnconfiguredAiSessionEventClient();
	}

	@Bean(name = "aiSessionEventExecutor")
	public Executor aiSessionEventExecutor() {
		ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
		executor.setCorePoolSize(2);
		executor.setMaxPoolSize(4);
		executor.setQueueCapacity(100);
		executor.setThreadNamePrefix("ai-session-event-");
		executor.setWaitForTasksToCompleteOnShutdown(true);
		executor.setAwaitTerminationSeconds(5);
		executor.initialize();
		return executor;
	}
}
