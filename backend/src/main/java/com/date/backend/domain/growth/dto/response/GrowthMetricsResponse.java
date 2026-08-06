package com.date.backend.domain.growth.dto.response;
import java.util.Map;
public record GrowthMetricsResponse(String aggregationVersion, GrowthMetricPeriodResponse currentPeriod,
        GrowthMetricPeriodResponse previousPeriod, int currentSessionCount, int previousSessionCount,
        Map<String, GrowthMetricAxisResponse> axes) {}
