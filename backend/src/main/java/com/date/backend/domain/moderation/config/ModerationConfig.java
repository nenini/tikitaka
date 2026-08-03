package com.date.backend.domain.moderation.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(NoShowPolicyProperties.class)
public class ModerationConfig {}
