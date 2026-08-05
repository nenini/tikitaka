package com.date.backend.domain.growth.api;

import com.date.backend.domain.growth.application.GrowthSessionQueryService;
import com.date.backend.domain.growth.application.GrowthMetricAggregationService;
import com.date.backend.domain.growth.application.MannerTemperatureService;
import com.date.backend.domain.growth.application.GrowthBadgeService;
import com.date.backend.domain.growth.domain.GrowthSessionStatus;
import com.date.backend.domain.growth.dto.response.GrowthSessionHistoryResponse;
import com.date.backend.domain.growth.dto.response.GrowthMetricsResponse;
import com.date.backend.domain.growth.dto.response.UserTemperatureResponse;
import com.date.backend.domain.growth.dto.response.GrowthBadgesResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.constraints.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@Validated
@RequestMapping("/api/v1/growth")
public class GrowthController implements GrowthSwaggerDocs {
	private final GrowthSessionQueryService service;
	private final GrowthMetricAggregationService metricService;
	private final MannerTemperatureService temperatureService;
	private final GrowthBadgeService badgeService;
	public GrowthController(GrowthSessionQueryService service, GrowthMetricAggregationService metricService,
			MannerTemperatureService temperatureService, GrowthBadgeService badgeService) {
		this.service = service;
		this.metricService = metricService;
		this.temperatureService = temperatureService;
		this.badgeService = badgeService;
	}

	@GetMapping("/sessions")
	public ApiResponse<GrowthSessionHistoryResponse> getSessions(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
			@RequestParam(required = false) GrowthSessionStatus status,
			@RequestParam(required = false) @Positive Long cursor,
			@RequestParam(defaultValue = "20") @Min(1) @Max(50) int size) {
		return ApiResponse.success(service.getHistory(authUser.userId(), from, to, status, cursor, size));
	}

	@GetMapping("/metrics")
	public ApiResponse<GrowthMetricsResponse> getMetrics(
			@AuthenticationPrincipal AuthUser authUser,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		return ApiResponse.success(metricService.getMetrics(authUser.userId(), from, to));
	}

	@GetMapping("/temperature")
	public ApiResponse<UserTemperatureResponse> getTemperature(@AuthenticationPrincipal AuthUser authUser) {
		return ApiResponse.success(temperatureService.getTemperature(authUser.userId()));
	}

	@GetMapping("/badges")
	public ApiResponse<GrowthBadgesResponse> getBadges(@AuthenticationPrincipal AuthUser authUser) {
		return ApiResponse.success(badgeService.getBadges(authUser.userId()));
	}
}
