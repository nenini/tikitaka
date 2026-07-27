package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.dto.request.AiChatStreamRequest;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Tag(name = "AI Chat Stream", description = "SSE 기반 AI 채팅 응답 스트리밍 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface AiChatStreamSwaggerDocs {
	@Operation(
			summary = "사용자 메시지 전송 및 AI 응답 스트리밍",
			description = """
					사용자 메시지를 DB에 USER 타입으로 저장한 뒤 AI 서버에 전달합니다.
					백엔드는 사용자 프로필의 성별·나이, 세션 목적, 선택된 페르소나 키,
					세션의 전체 대화 이력을 AI 서버 요청에 포함합니다.

					SSE 이벤트 순서는 connected → persona(첫 선택 시) → chunk(1..N) → done입니다.
					처리 중 실패하면 error 이벤트가 전송됩니다.
					Swagger UI는 POST SSE 연결을 완전하게 표시하지 못할 수 있으므로
					실제 스트림 검증에는 curl -N 또는 프론트 fetch 스트림을 사용하세요.
					"""
	)
	@ApiResponses({
			@ApiResponse(
					responseCode = "200",
					description = "SSE 연결 성공",
					content = @Content(
							mediaType = "text/event-stream",
							examples = @ExampleObject(
									name = "SSE 이벤트 예시",
									value = """
											event: connected
											data: {"sessionId":15,"userMessageId":101}

											event: persona
											data: {"personaKey":"FEMALE_26_CALM_01","displayName":"차분한 상대"}

											event: chunk
											data: {"sequence":1,"content":"안녕하세요."}

											event: chunk
											data: {"sequence":2,"content":" 만나서 반가워요!"}

											event: done
											data: {"sessionId":15,"aiMessageId":102,"messageSequence":2,"personaKey":"FEMALE_26_CALM_01"}

											"""
							)
					)
			),
			@ApiResponse(responseCode = "400", description = "입력값 오류 또는 AI 채팅 프로필 정보 부족"),
			@ApiResponse(responseCode = "401", description = "인증 실패"),
			@ApiResponse(responseCode = "403", description = "세션 소유자가 아님"),
			@ApiResponse(responseCode = "404", description = "세션 또는 사용자 프로필 없음"),
			@ApiResponse(responseCode = "409", description = "종료된 세션")
	})
	SseEmitter stream(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 채팅 세션 ID", example = "15") Long sessionId,
			@Valid AiChatStreamRequest request
	);
}
