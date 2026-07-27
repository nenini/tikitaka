package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.application.AiChatMessageService;
import com.date.backend.domain.aichat.dto.request.AiChatMessageCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatMessageResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/ai-chat/sessions/{sessionId}/messages")
public class AiChatMessageController implements AiChatMessageSwaggerDocs {
	private final AiChatMessageService messageService;

	public AiChatMessageController(AiChatMessageService messageService) {
		this.messageService = messageService;
	}

	@Override
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ApiResponse<AiChatMessageResponse> save(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId,
			@Valid @RequestBody AiChatMessageCreateRequest request
	) {
		return ApiResponse.success(messageService.save(authUser.userId(), sessionId, request));
	}

	@Override
	@GetMapping
	public ApiResponse<List<AiChatMessageResponse>> getMessages(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId
	) {
		return ApiResponse.success(messageService.getMessages(authUser.userId(), sessionId));
	}
}
