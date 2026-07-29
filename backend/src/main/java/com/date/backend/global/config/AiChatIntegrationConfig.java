package com.date.backend.global.config;

import com.date.backend.domain.aichat.integration.AiChatProperties;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamer;
import com.date.backend.domain.aichat.integration.HttpAiChatResponseStreamer;
import com.date.backend.domain.aichat.integration.UnconfiguredAiChatResponseStreamer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(AiChatProperties.class)
public class AiChatIntegrationConfig {
	@Bean
	public AiChatResponseStreamer aiChatResponseStreamer(
			AiChatProperties properties,
			ObjectMapper objectMapper
	) {
		if (properties.configured()) {
			return new HttpAiChatResponseStreamer(properties, objectMapper);
		}
		return new UnconfiguredAiChatResponseStreamer();
	}
}
