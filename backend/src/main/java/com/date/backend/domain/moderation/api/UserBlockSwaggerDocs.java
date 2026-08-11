package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.dto.request.UserBlockCreateRequest;
import com.date.backend.domain.moderation.dto.response.UserBlockDeleteResponse;
import com.date.backend.domain.moderation.dto.response.UserBlockListResponse;
import com.date.backend.domain.moderation.dto.response.UserBlockResponse;
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

@Tag(name = "Moderation", description = "사용자 신고 및 차단 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface UserBlockSwaggerDocs {
	@Operation(
			summary = "사용자 차단",
			description = """
					로그인 사용자가 지정한 사용자를 차단합니다. 같은 요청은 기존 차단 결과를 반환합니다.
					차단 관계는 양방향으로 매칭 후보 선정과 매칭 생성 검증에 반영됩니다.
					요청 본문은 생략할 수 있으며 필요한 경우 최대 500자의 내부 차단 사유를 전달할 수 있습니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "차단 성공 또는 기존 차단 결과 반환"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "자기 자신 차단 요청"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "차단 대상 사용자를 찾을 수 없음"
			)
	})
	ApiResponse<UserBlockResponse> block(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "차단할 사용자 ID", example = "2")
			@Positive Long userId,
			@Valid UserBlockCreateRequest request
	);

	@Operation(
			summary = "사용자 차단 해제",
			description = "차단 관계를 해제합니다. 관계가 없어도 성공 응답을 반환하는 멱등 API입니다."
	)
	ApiResponse<UserBlockDeleteResponse> unblock(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "차단 해제할 사용자 ID", example = "2")
			@Positive Long userId
	);

	@Operation(
			summary = "내 차단 목록 조회",
			description = "현재 사용자가 직접 차단한 사용자 목록을 최근 차단 순으로 조회합니다."
	)
	ApiResponse<UserBlockListResponse> getMyBlocks(
			@Parameter(hidden = true) AuthUser authUser
	);
}
