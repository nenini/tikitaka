package com.date.backend.domain.room.api;

import com.date.backend.domain.room.dto.response.SessionDetailResponse;
import com.date.backend.domain.room.dto.response.SessionJoinResponse;
import com.date.backend.domain.room.dto.response.SessionStatusResponse;
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

@Tag(name = "Session", description = "화상 세션 생명주기 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface SessionSwaggerDocs {

	@Operation(
			summary = "세션 상세 조회",
			description = """
					매칭 확정 후 생성된 화상 세션의 상세 정보를 조회합니다.
					해당 세션 참여자만 조회할 수 있으며 참여자, 예정 시작 시각,
					현재 상태와 남은 시간을 초 단위로 반환합니다.
					세션 시작 전에는 예정 시작까지, 진행 중에는 예정 종료까지의
					남은 시간을 반환하고 종료된 세션은 0을 반환합니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "세션 상세 조회 성공",
					content = @Content(schema = @Schema(
							implementation = SessionDetailResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "세션 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "세션이 존재하지 않음"
			)
	})
	ApiResponse<SessionDetailResponse> getDetail(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);

	@Operation(
			summary = "세션 입장",
			description = """
					세션 참여자와 입장 가능 시간을 검증하고 입장 시각을 저장합니다.
					중복 입장은 기존 입장 시각을 유지하는 멱등 요청입니다.
					LiveKit 설정이 완료된 환경에서는 프론트 접속에 사용할 URL과
					참여자 전용 토큰을 함께 반환합니다.
					"""
	)
	ApiResponse<SessionJoinResponse> join(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);

	@Operation(
			summary = "세션 시작",
			description = """
					두 참여자가 모두 입장하고 준비 완료한 세션을 시작합니다.
					예약 시작 시각 이후에만 가능하며 성공 시 상태가 IN_PROGRESS로
					변경되고 실제 시작 시각이 저장됩니다.
					"""
	)
	ApiResponse<SessionStatusResponse> start(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);

	@Operation(
			summary = "세션 상태 조회",
			description = """
					현재 세션 상태와 참여자별 입장·준비 여부, 남은 시간을 조회합니다.
					세션 참여자만 조회할 수 있습니다.
					"""
	)
	ApiResponse<SessionStatusResponse> getStatus(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);
}
