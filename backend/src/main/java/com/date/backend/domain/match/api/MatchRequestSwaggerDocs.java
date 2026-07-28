package com.date.backend.domain.match.api;

import com.date.backend.domain.match.dto.request.MatchRequestCancelRequest;
import com.date.backend.domain.match.dto.request.MatchRequestSaveRequest;
import com.date.backend.domain.match.dto.response.MatchRequestResponse;
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

@Tag(name = "Match Request", description = "실사용자 화상 매칭 신청 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface MatchRequestSwaggerDocs {

	@Operation(
			summary = "매칭 신청",
			description = "선호 연령과 가능 시간을 저장하고 현재 FACE/SURVEY 조건을 snapshot으로 생성합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "201",
					description = "신청 성공",
					content = @Content(schema = @Schema(implementation = MatchRequestResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 오류"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "409",
					description = "활성 요청 존재 또는 사전 정보 미완료"
			)
	})
	ApiResponse<MatchRequestResponse> create(
			@Parameter(hidden = true) AuthUser authUser,
			@Valid MatchRequestSaveRequest request
	);

	@Operation(summary = "현재 매칭 신청 조회")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "조회 성공",
					content = @Content(schema = @Schema(implementation = MatchRequestResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "인증 실패"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "활성 요청 없음")
	})
	ApiResponse<MatchRequestResponse> getCurrent(
			@Parameter(hidden = true) AuthUser authUser
	);

	@Operation(
			summary = "현재 매칭 신청 수정",
			description = "WAITING 요청의 조건과 FACE/SURVEY snapshot을 현재 값으로 교체합니다."
	)
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(
					responseCode = "200",
					description = "수정 성공",
					content = @Content(schema = @Schema(implementation = MatchRequestResponse.class))
			),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력값 오류"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "활성 요청 없음"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "수정 불가능한 상태")
	})
	ApiResponse<MatchRequestResponse> update(
			@Parameter(hidden = true) AuthUser authUser,
			@Valid MatchRequestSaveRequest request
	);

	@Operation(summary = "현재 매칭 대기 취소")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "취소 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "활성 요청 없음"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "취소 불가능한 상태")
	})
	ApiResponse<Void> cancel(
			@Parameter(hidden = true) AuthUser authUser,
			@Valid MatchRequestCancelRequest request
	);
}
