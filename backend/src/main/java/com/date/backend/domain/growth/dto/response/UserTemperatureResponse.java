package com.date.backend.domain.growth.dto.response;
import java.math.BigDecimal;
import java.util.List;
public record UserTemperatureResponse(BigDecimal currentTemperature, BigDecimal minimumTemperature,
        BigDecimal maximumTemperature, String policyVersion, TemperatureChangeResponse recentChange,
        List<TemperatureChangeResponse> histories) {}
