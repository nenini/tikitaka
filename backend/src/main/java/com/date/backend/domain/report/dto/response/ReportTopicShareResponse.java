package com.date.backend.domain.report.dto.response;

import java.math.BigDecimal;

/**
 * 주제별 발화 비중 한 줄. AI가 전사를 사전 기반으로 분류해 계산한 값을 그대로 전달한다.
 *
 * <p>주제 목록은 AI 사전이 확장되면 늘어나므로 Backend는 enum으로 닫지 않는다.
 * label은 화면에 그대로 노출할 한국어 문자열이다.
 */
public record ReportTopicShareResponse(
		String topic,
		String label,
		Integer utteranceCount,
		Long speakingMs,
		BigDecimal ratio
) {}
