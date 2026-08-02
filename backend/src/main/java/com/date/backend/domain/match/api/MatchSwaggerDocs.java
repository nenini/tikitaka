package com.date.backend.domain.match.api;

import com.date.backend.domain.match.dto.request.MatchCancellationRequest;
import com.date.backend.domain.match.dto.response.MatchCancellationResponse;
import com.date.backend.domain.match.dto.response.MatchResultResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;

@Tag(name = "Match", description = "매칭 결과 조회, 수락·거절, 확정 매칭 취소 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface MatchSwaggerDocs {

	@Operation(
			summary = "현재 매칭 결과 조회",
			description = "수락 대기 또는 확정 상태인 현재 매칭과 상대 공개 프로필, 점수를 조회합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(
							implementation = MatchResultResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "401",
					description = "인증 실패"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "현재 매칭 없음"
			)
	})
	ApiResponse<MatchResultResponse> getCurrent(
			@Parameter(hidden = true) AuthUser authUser
	);

	@Operation(
			summary = "매칭 수락",
			description = """
					수락 제한 시간 안에 매칭을 수락합니다.
					양쪽 모두 수락하면 매칭 성립 시 제시된 공통 세션 시각으로 예약을 확정합니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "수락 성공",
					content = @Content(schema = @Schema(
							implementation = MatchResultResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "매칭 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "매칭 없음"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "중복 응답, 응답 불가 상태 또는 수락 시간 만료"
			)
	})
	ApiResponse<MatchResultResponse> accept(
			@Parameter(hidden = true) AuthUser authUser,
			@Positive Long matchPairId
	);

	@Operation(
			summary = "매칭 거절",
			description = """
					수락 대기 중인 매칭을 거절합니다.
					거절한 사용자의 매칭 신청은 종료하고 상대방만 다시 매칭 대기 상태로 변경합니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "거절 성공",
					content = @Content(schema = @Schema(
							implementation = MatchResultResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "매칭 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "매칭 없음"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "중복 응답, 응답 불가 상태 또는 수락 시간 만료"
			)
	})
	ApiResponse<MatchResultResponse> reject(
			@Parameter(hidden = true) AuthUser authUser,
			@Positive Long matchPairId
	);

	@Operation(
			summary = "확정 매칭 취소",
			description = """
					세션 시작 전 확정 매칭을 취소합니다.
					기본 정책상 예약 시각 24시간 이내의 취소는 직전 취소로 표시됩니다.
					취소 시 양쪽 기존 신청을 종료하고 상대방 알림 연동용 이벤트를 발행합니다.
					"""
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "취소 성공",
					content = @Content(schema = @Schema(
							implementation = MatchCancellationResponse.class
					))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "400",
					description = "취소 사유 길이 초과"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "403",
					description = "매칭 참여자가 아님"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "404",
					description = "매칭 없음"
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "확정 상태가 아니거나 세션이 이미 시작됨"
			)
	})
	ApiResponse<MatchCancellationResponse> cancel(
			@Parameter(hidden = true) AuthUser authUser,
			@Positive Long matchPairId,
			@Valid
			@io.swagger.v3.oas.annotations.parameters.RequestBody(
					required = false,
					content = @Content(
							schema = @Schema(
									implementation = MatchCancellationRequest.class
							),
							examples = @ExampleObject(value = """
									{
									  "reason": "일정 변경"
									}
									""")
					)
			)
			MatchCancellationRequest request
	);
}
