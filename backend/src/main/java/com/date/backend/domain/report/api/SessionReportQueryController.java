package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.SessionReportQueryService;
import com.date.backend.domain.report.dto.response.*;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.constraints.Positive;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@Validated
@RequestMapping("/api/v1")
public class SessionReportQueryController implements SessionReportQuerySwaggerDocs {
	private final SessionReportQueryService queryService;
	public SessionReportQueryController(SessionReportQueryService queryService) {
		this.queryService = queryService;
	}

	@GetMapping("/sessions/{sessionId}/report")
	public ApiResponse<SessionReportSummaryResponse> getBySession(
			@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long sessionId) {
		return ApiResponse.success(queryService.getBySession(authUser.userId(), sessionId));
	}

	@GetMapping("/reports/{reportId}")
	public ApiResponse<SessionReportDetailResponse> getDetail(
			@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long reportId) {
		return ApiResponse.success(queryService.getDetail(authUser.userId(), reportId));
	}
}
