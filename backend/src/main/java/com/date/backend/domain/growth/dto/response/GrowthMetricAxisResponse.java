package com.date.backend.domain.growth.dto.response;
import java.math.BigDecimal;
public record GrowthMetricAxisResponse(BigDecimal currentAverage, BigDecimal previousAverage, BigDecimal change,
        int currentMeasuredCount, int previousMeasuredCount, boolean measured) {}
