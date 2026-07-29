package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.SessionQueryService;
import com.date.backend.domain.room.application.SessionLifecycleService;
import com.date.backend.domain.room.dto.response.SessionDetailResponse;
import com.date.backend.domain.room.dto.response.SessionJoinResponse;
import com.date.backend.domain.room.dto.response.SessionStatusResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/sessions")
public class SessionController implements SessionSwaggerDocs {
	private final SessionQueryService sessionQueryService;
	private final SessionLifecycleService lifecycleService;

	public SessionController(
			SessionQueryService sessionQueryService,
			SessionLifecycleService lifecycleService
	) {
		this.sessionQueryService = sessionQueryService;
		this.lifecycleService = lifecycleService;
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
}
