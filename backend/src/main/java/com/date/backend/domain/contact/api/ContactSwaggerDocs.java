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

@Tag(name = "Contact", description = "세션 종료 전 추가 5분 진행 의사 처리 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface ContactSwaggerDocs {

	@Operation(
			summary = "세션 추가 5분 진행 의사 제출",
			description = """
					LiveKit 세션은 처음부터 최대 35분으로 운영하며, 시작 후 25~30분 사이에 각 참여자가 AGREE 또는 DECLINE을 한 번 제출합니다.
					양측이 모두 AGREE하면 별도의 LiveKit 연장 작업 없이 35분까지 세션을 유지합니다.
					한 명이 DECLINE하거나 30분까지 응답하지 않으면 세션은 30분 시점에 종료되고 LiveKit Room이 닫힙니다.

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
