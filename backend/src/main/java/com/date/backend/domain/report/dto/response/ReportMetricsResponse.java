package com.date.backend.domain.report.dto.response;

import java.math.BigDecimal;
import java.util.Map;

public record ReportMetricsResponse(
		Long speakingMs,
		BigDecimal speakingRatio,
		Integer longSilenceCount,
		Integer silenceThresholdMs,
		Integer interruptionCount,
		Integer backchannelCount,
		Integer fillerCount,
		Integer questionCount,
		Integer smileEpisodeCount,
		Integer gazeAwayCount,
		Integer faceMissingCount,
		boolean visionMeasured,
		ReportCoverageResponse coverage,
		Map<String, Integer> fillerBreakdown
) {}
