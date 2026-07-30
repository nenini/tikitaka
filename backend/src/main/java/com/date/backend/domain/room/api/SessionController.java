package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.SessionQueryService;
import com.date.backend.domain.room.application.SessionLifecycleService;
import com.date.backend.domain.room.application.SessionTerminationService;
import com.date.backend.domain.room.dto.request.SessionAnalysisSettingsRequest;
import com.date.backend.domain.room.dto.request.SessionTerminateRequest;
import com.date.backend.domain.room.dto.response.SessionAnalysisSettingsResponse;
import com.date.backend.domain.room.dto.response.SessionEndedResponse;
import com.date.backend.domain.room.dto.response.SessionDetailResponse;
import com.date.backend.domain.room.dto.response.SessionJoinResponse;
import com.date.backend.domain.room.dto.response.SessionStatusResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/sessions")
public class SessionController implements SessionSwaggerDocs {
	private final SessionQueryService sessionQueryService;
	private final SessionLifecycleService lifecycleService;
	private final SessionTerminationService terminationService;

	public SessionController(
			SessionQueryService sessionQueryService,
			SessionLifecycleService lifecycleService,
			SessionTerminationService terminationService
	) {
		this.sessionQueryService = sessionQueryService;
		this.lifecycleService = lifecycleService;
		this.terminationService = terminationService;
	}

	@GetMapping("/{sessionId}")
	@Override
	public ApiResponse<SessionDetailResponse> getDetail(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				sessionQueryService.getDetail(authUser.userId(), sessionId)
		);
	}

	@PostMapping("/{sessionId}/join")
	@Override
	public ApiResponse<SessionJoinResponse> join(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				lifecycleService.join(authUser.userId(), sessionId)
		);
	}

	@PostMapping("/{sessionId}/start")
	@Override
	public ApiResponse<SessionStatusResponse> start(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				lifecycleService.start(authUser.userId(), sessionId)
		);
	}

	@PatchMapping("/{sessionId}/analysis-settings")
	@Override
	public ApiResponse<SessionAnalysisSettingsResponse> updateAnalysisSettings(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId,
			@Valid @RequestBody SessionAnalysisSettingsRequest request
	) {
		return ApiResponse.success(lifecycleService.updateAnalysisSettings(
				authUser.userId(),
				sessionId,
				request
		));
	}

	@GetMapping("/{sessionId}/status")
	@Override
	public ApiResponse<SessionStatusResponse> getStatus(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				lifecycleService.getStatus(authUser.userId(), sessionId)
		);
	}

	@PostMapping("/{sessionId}/complete")
	@Override
	public ApiResponse<SessionEndedResponse> complete(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(
				terminationService.complete(authUser.userId(), sessionId)
		);
	}

	@PostMapping("/{sessionId}/terminate")
	@Override
	public ApiResponse<SessionEndedResponse> terminate(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId,
			@RequestBody SessionTerminateRequest request
	) {
		return ApiResponse.success(
				terminationService.terminate(
						authUser.userId(),
						sessionId,
						request.reason().toDomain()
				)
		);
	}
}
