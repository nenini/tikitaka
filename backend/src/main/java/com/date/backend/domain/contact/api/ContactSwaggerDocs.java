package com.date.backend.domain.contact.api;

import com.date.backend.domain.contact.dto.request.SessionExtensionDecisionRequest;
import com.date.backend.domain.contact.dto.response.SessionExtensionDecisionResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;

@Tag(name = "Contact", description = "세션 마지막 5분 유지 의사 처리 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface ContactSwaggerDocs {

	@Operation(
			summary = "세션 마지막 5분 유지 의사 제출",
			description = """
					세션은 처음부터 35분으로 운영됩니다.
					종료 5분 전부터 각 참여자가 AGREE 또는 DECLINE을 한 번 제출합니다.
					양측이 AGREE하면 별도 시간 추가 없이 예정된 35분까지 세션을 유지합니다.
					한 명이라도 DECLINE하면 기존 조기 종료 흐름을 통해 세션과 LiveKit Room을 종료합니다.

					상태 변경 이벤트 구독 경로:
					/topic/sessions/{sessionId}/extensions
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "의사 제출 성공 또는 동일 요청 결과 반환"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "세션 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "세션을 찾을 수 없음"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "요청 가능 시간이 아니거나 이미 다른 의사를 제출함"
			)
	})
	ApiResponse<SessionExtensionDecisionResponse> decideExtension(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId,
			@Valid SessionExtensionDecisionRequest request
	);
}
