package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.dto.response.AiChatMessageResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

@Tag(name = "AI Chat Message", description = "소개팅 연습 AI 채팅 메시지 조회 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface AiChatMessageSwaggerDocs {

	@Operation(summary = "AI 채팅 메시지 목록 조회", description = "세션 소유자가 메시지를 발생 순서대로 조회합니다.")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "세션 소유자가 아님"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "세션 없음")
	})
	ApiResponse<List<AiChatMessageResponse>> getMessages(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 채팅 세션 ID") Long sessionId
	);
}
