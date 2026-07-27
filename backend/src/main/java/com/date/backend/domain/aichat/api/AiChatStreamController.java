package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.application.AiChatStreamService;
import com.date.backend.domain.aichat.dto.request.AiChatStreamRequest;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/ai-chat/sessions/{sessionId}/responses")
public class AiChatStreamController implements AiChatStreamSwaggerDocs {
	private final AiChatStreamService streamService;

	public AiChatStreamController(AiChatStreamService streamService) {
		this.streamService = streamService;
	}

	@Override
	@PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public SseEmitter stream(
			@AuthenticationPrincipal AuthUser authUser,
			@PathVariable Long sessionId,
			@Valid @RequestBody AiChatStreamRequest request
	) {
		return streamService.stream(authUser.userId(), sessionId, request.messageText());
	}
}
