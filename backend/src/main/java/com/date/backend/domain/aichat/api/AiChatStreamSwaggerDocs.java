package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.dto.request.AiChatStreamRequest;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Tag(name = "AI Chat Stream", description = "SSE 기반 AI 채팅 응답 스트리밍 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface AiChatStreamSwaggerDocs {
	@Operation(
			summary = "AI 응답 스트리밍",
			description = """
					사용자 메시지를 저장하고 AI 응답을 SSE로 순차 전송합니다.
					이벤트 순서는 connected → chunk(1..N) → done이며, 실패하면 error 이벤트가 전송됩니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "SSE 연결 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 오류"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "세션 소유자가 아님"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "세션 없음")
	})
	SseEmitter stream(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 채팅 세션 ID") Long sessionId,
			@Valid AiChatStreamRequest request
	);
}
