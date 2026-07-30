package com.date.backend.domain.coach.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(AiSessionProperties.class)
public class AiSessionConfig {
}
