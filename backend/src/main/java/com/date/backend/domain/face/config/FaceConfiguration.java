package com.date.backend.domain.face.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(FaceAnalysisProperties.class)
public class FaceConfiguration {
}
