package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.application.AiChatSessionService;
import com.date.backend.domain.aichat.dto.request.AiChatSessionCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCreateResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCloseResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionSummaryResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionDetailResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/ai-chat/sessions")
public class AiChatSessionController implements AiChatSessionSwaggerDocs {
	private final AiChatSessionService sessionService;

	public AiChatSessionController(AiChatSessionService sessionService) {
		this.sessionService = sessionService;
	}

	@Override
	@GetMapping
	public ApiResponse<List<AiChatSessionSummaryResponse>> getSessions(
			@AuthenticationPrincipal AuthUser authUser
	) {
		return ApiResponse.success(sessionService.getSessions(authUser.userId()));
	}

	@Override
	@GetMapping("/{sessionId}")
	public ApiResponse<AiChatSessionDetailResponse> getSession(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(sessionService.getSession(authUser.userId(), sessionId));
	}

	@Override
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<AiChatSessionCreateResponse> create(
			@AuthenticationPrincipal AuthUser authUser,
			@Valid @RequestBody AiChatSessionCreateRequest request
	) {
		return ApiResponse.success(sessionService.create(authUser.userId(), request));
	}

	@Override
	@PatchMapping("/{sessionId}/close")
	public ApiResponse<AiChatSessionCloseResponse> close(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(sessionService.close(authUser.userId(), sessionId));
	}
}
