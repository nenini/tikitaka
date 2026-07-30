package com.date.backend.domain.result.api;

import com.date.backend.domain.result.dto.EvaluationItemsResponse;
import com.date.backend.domain.result.dto.EvaluationStatusResponse;
import com.date.backend.domain.result.dto.PeerEvaluationResultResponse;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitRequest;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Positive;

@Tag(name = "Result", description = "세션 종료 후 상대 평가 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface PeerEvaluationSwaggerDocs {
	@Operation(
			summary = "상대 평가 항목 조회",
			description = "정상 종료된 세션의 참가자가 평가 항목과 상대 사용자 ID를 조회합니다."
	)
	ApiResponse<EvaluationItemsResponse> getItems(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);

	@Operation(
			summary = "양측 평가 제출 상태 조회",
			description = "본인과 상대방의 평가 제출 여부, 세션 종료 후 48시간인 제출 마감 시각, "
					+ "남은 시간과 결과 공개·영구 잠금 상태를 조회합니다."
	)
	ApiResponse<EvaluationStatusResponse> getStatus(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);

	@Operation(
			summary = "상대 평가 제출",
			description = "정상 완료 또는 시간 만료로 종료된 세션의 상대방을 한 번만 평가할 수 있습니다. "
					+ "세션 종료 후 48시간이 지나면 제출할 수 없습니다. "
					+ "별점 6개는 모두 필수이며 1~5점이고, 서술형 2개는 선택이며 각각 최대 1,000자입니다. "
					+ "응답의 reportRequested는 실제 리포트 생성 완료가 아니라 "
					+ "양측 평가 완료 이벤트 발행 여부를 의미합니다."
	)
	ApiResponse<PeerEvaluationSubmitResponse> submit(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId,
			PeerEvaluationSubmitRequest request
	);

	@Operation(
			summary = "내가 받은 평가 결과 조회",
			description = "본인이 48시간 안에 평가를 제출하고 양측 제출이 완료된 경우, "
					+ "상대방이 나에게 부여한 별점과 "
					+ "선택 서술형 피드백을 조회합니다."
	)
	ApiResponse<PeerEvaluationResultResponse> getResult(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15")
			@Positive Long sessionId
	);
}
