package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.SessionQueryService;
import com.date.backend.domain.room.dto.response.SessionDetailResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/sessions")
public class SessionController implements SessionSwaggerDocs {
	private final SessionQueryService sessionQueryService;

	public SessionController(SessionQueryService sessionQueryService) {
		this.sessionQueryService = sessionQueryService;
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
}
