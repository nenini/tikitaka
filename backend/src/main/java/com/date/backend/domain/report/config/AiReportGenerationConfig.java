package com.date.backend.domain.report.config;

import com.date.backend.domain.report.integration.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.*;

@Configuration
@EnableConfigurationProperties(AiReportGenerationProperties.class)
public class AiReportGenerationConfig {
	@Bean
	public AiReportGenerationClient aiReportGenerationClient(
			AiReportGenerationProperties properties, ObjectMapper objectMapper) {
		return properties.configured()
				? new HttpAiReportGenerationClient(properties, objectMapper)
				: new UnconfiguredAiReportGenerationClient();
	}
}
