package com.date.backend.domain.face.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "face.analysis")
public record FaceAnalysisProperties(long requestValiditySeconds) {

	public FaceAnalysisProperties {
		if (requestValiditySeconds <= 0) {
			throw new IllegalArgumentException("얼굴상 분석 요청 유효 시간은 0초보다 커야 합니다.");
		}
	}
}
