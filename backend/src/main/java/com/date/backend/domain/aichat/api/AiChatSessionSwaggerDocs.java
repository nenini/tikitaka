package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.dto.request.AiChatSessionCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCreateResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCloseResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@Tag(name = "AI Chat", description = "소개팅 연습 AI 채팅 세션 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface AiChatSessionSwaggerDocs {

	@Operation(
			summary = "AI 채팅 세션 생성",
			description = "인증 사용자의 소개팅 연습용 AI 채팅 세션을 생성합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "생성 성공",
					content = @Content(schema = @Schema(implementation = AiChatSessionCreateResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 오류"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "페르소나 없음"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "활성 세션 중복")
	})
	ApiResponse<AiChatSessionCreateResponse> create(
			@Parameter(hidden = true) AuthUser authUser,
			@Valid AiChatSessionCreateRequest request
	);

	@Operation(
			summary = "AI 채팅 세션 종료",
			description = "세션 소유자의 진행 중인 AI 채팅 세션을 종료합니다. 반복 요청에도 기존 종료 상태와 시각을 유지합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "종료 성공 또는 이미 종료됨",
					content = @Content(schema = @Schema(implementation = AiChatSessionCloseResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "세션 소유자가 아님"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "세션 없음")
	})
	ApiResponse<AiChatSessionCloseResponse> close(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 채팅 세션 ID") Long sessionId
	);
}
