package com.date.backend.domain.growth.dto.response;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record TemperatureChangeResponse(Long historyId, Long sessionId, String sourceType, Long sourceId,
        String reason, BigDecimal delta, BigDecimal beforeTemperature, BigDecimal afterTemperature,
        LocalDateTime changedAt) {}
