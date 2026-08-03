package com.date.backend.domain.moderation.config;

import com.date.backend.domain.moderation.integration.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(AiTranscriptProperties.class)
public class AiTranscriptConfig {
	@Bean
	AiSessionTranscriptClient aiSessionTranscriptClient(AiTranscriptProperties properties,
			ObjectMapper objectMapper) {
		return properties.configured()
				? new HttpAiSessionTranscriptClient(properties, objectMapper)
				: new UnconfiguredAiSessionTranscriptClient();
	}
}
