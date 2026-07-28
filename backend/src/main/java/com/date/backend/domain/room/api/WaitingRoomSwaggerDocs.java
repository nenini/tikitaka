package com.date.backend.domain.room.api;

import com.date.backend.domain.room.dto.response.WaitingRoomDetailResponse;
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
import jakarta.validation.constraints.Positive;

@Tag(name = "Waiting Room", description = "실제 소개팅 입장 전 대기방 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface WaitingRoomSwaggerDocs {

	@Operation(
			summary = "대기방 상세 조회",
			description = """
					매칭 참여자가 대기방 상태, 참여자 요약, 예정 시각과 현재 입장 가능 여부를 조회합니다.
					LiveKit 접속 토큰은 이 API에서 노출하지 않으며 실제 입장 API에서 별도로 발급합니다.
					입장 시간이 아니어도 상세 조회는 가능하고 canEnter=false 및 entryStatus로 사유를 반환합니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(
							implementation = WaitingRoomDetailResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "대기방 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "대기방이 존재하지 않음"
			)
	})
	ApiResponse<WaitingRoomDetailResponse> getDetail(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "대기방 ID", example = "1")
			@Positive Long roomId
	);
}
