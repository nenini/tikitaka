package com.date.backend.global.config;

import com.date.backend.domain.aichat.integration.AiChatResponseStreamer;
import com.date.backend.domain.aichat.integration.UnconfiguredAiChatResponseStreamer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiChatIntegrationConfig {
	@Bean
	@ConditionalOnMissingBean(AiChatResponseStreamer.class)
	public AiChatResponseStreamer aiChatResponseStreamer() {
		return new UnconfiguredAiChatResponseStreamer();
	}
}
