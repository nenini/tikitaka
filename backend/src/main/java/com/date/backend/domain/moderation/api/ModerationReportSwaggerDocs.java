package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.dto.request.ModerationReportCreateRequest;
import com.date.backend.domain.moderation.dto.response.ModerationReportResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@Tag(name = "Moderation", description = "세션 참여자 신고 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface ModerationReportSwaggerDocs {
	@Operation(
			summary = "세션 기반 사용자 신고 접수",
			description = """
					세션 참여자가 같은 세션의 상대방을 신고합니다.
					신고 사유와 상세 내용, 신고 당시 세션 상태 및 첨부 증거 메타데이터를 저장합니다.
					증거 원본은 이 API로 전송하지 않으며, 비공개 저장소에 먼저 업로드한 뒤 objectKey만 전달합니다.
					동일 세션에서 같은 신고자가 같은 사용자를 다시 신고하면 409를 반환합니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "신고 접수 성공"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "잘못된 요청 또는 피신고자가 세션 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "신고자가 세션 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "세션을 찾을 수 없음"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "동일 세션·대상 중복 신고"
			)
	})
	ApiResponse<ModerationReportResponse> create(
			AuthUser authUser,
			@Valid ModerationReportCreateRequest request
	);
}
