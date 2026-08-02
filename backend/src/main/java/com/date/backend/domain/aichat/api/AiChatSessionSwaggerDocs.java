package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.dto.request.AiChatSessionCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCloseResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCreateResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionSummaryResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionDetailResponse;
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

import java.util.List;

@Tag(name = "AI Chat", description = "소개팅 연습 AI 채팅 세션 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface AiChatSessionSwaggerDocs {

	@Operation(summary = "내 AI 채팅 세션 목록", description = "최신 세션부터 응답 상태와 마지막 메시지를 조회합니다.")
	ApiResponse<List<AiChatSessionSummaryResponse>> getSessions(
			@Parameter(hidden = true) AuthUser authUser
	);

	@Operation(summary = "AI 채팅 세션 상세", description = "세션 상태와 전체 USER·AI 메시지를 순서대로 조회합니다.")
	ApiResponse<AiChatSessionDetailResponse> getSession(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 채팅 세션 ID") Long sessionId
	);

	@Operation(
			summary = "AI 채팅 세션 생성",
			description = """
					인증 사용자의 AI 채팅 세션을 생성합니다.
					페르소나는 세션 생성 시 선택하지 않고 첫 AI 요청에서 성별·나이 조건에 따라
					AI 서버가 선택하므로 생성 직후 aiPersonaKey는 null입니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "생성 성공",
					content = @Content(schema = @Schema(implementation = AiChatSessionCreateResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 오류"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
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
			@Parameter(description = "AI 채팅 세션 ID", example = "1") Long sessionId
	);
}
