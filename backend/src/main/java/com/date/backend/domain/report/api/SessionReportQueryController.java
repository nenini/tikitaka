package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.SessionReportQueryService;
import com.date.backend.domain.report.application.SessionReportCommandService;
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
	private final SessionReportCommandService commandService;
	public SessionReportQueryController(SessionReportQueryService queryService,
			SessionReportCommandService commandService) {
		this.queryService = queryService;
		this.commandService = commandService;
	}

	@PostMapping("/sessions/{sessionId}/report")
	@ResponseStatus(org.springframework.http.HttpStatus.ACCEPTED)
	public ApiResponse<SessionReportStatusResponse> requestGeneration(
			@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long sessionId) {
		return ApiResponse.success(commandService.request(authUser.userId(), sessionId));
	}

	@GetMapping("/sessions/{sessionId}/report/status")
	public ApiResponse<SessionReportStatusResponse> getStatus(
			@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long sessionId) {
		return ApiResponse.success(queryService.getStatus(authUser.userId(), sessionId));
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

	@GetMapping("/reports/{reportId}/analyses/{axisCode}")
	public ApiResponse<ReportAxisDetailResponse> getAxis(
			@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long reportId,
			@PathVariable String axisCode) {
		return ApiResponse.success(queryService.getAxis(authUser.userId(), reportId, axisCode));
	}

	@DeleteMapping("/reports/{reportId}")
	public ApiResponse<SessionReportDeleteResponse> delete(
			@AuthenticationPrincipal AuthUser authUser,
			@Positive @PathVariable Long reportId) {
		return ApiResponse.success(commandService.delete(authUser.userId(), reportId));
	}
}
