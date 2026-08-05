package com.date.backend.domain.growth.dto.response;
import java.time.LocalDate;
public record GrowthMetricPeriodResponse(LocalDate from, LocalDate to) {}
