package com.date.backend.domain.report.api;

import com.date.backend.domain.report.dto.response.*;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Positive;

@Tag(name = "AI Report", description = "인증 사용자 본인의 AI 세션 리포트 조회 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface SessionReportQuerySwaggerDocs {
	@Operation(summary = "세션 AI 리포트 요약 조회", description = """
			세션 참여자가 자신의 리포트 상태와 레이더 6축, 요약, 강점, 개선점을 조회합니다.
			PENDING·GENERATING 상태에서는 생성 결과가 null 또는 빈 배열이며 현재 상태와 요청 시각을 확인할 수 있습니다.
			FAILED 상태에서는 failureCode와 failureReason을 반환합니다. 다른 참여자의 리포트는 조회할 수 없습니다.
			""")
	ApiResponse<SessionReportSummaryResponse> getBySession(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15") @Positive Long sessionId);

	@Operation(summary = "AI 리포트 상세 피드백 조회", description = """
			리포트 소유자가 원본 행동 지표, 다음 미션과 근거 구간을 포함한 상세 결과를 조회합니다.
			근거 구간이 아직 제공되지 않은 분석 버전에서는 evidenceSegments가 빈 배열입니다.
			question처럼 측정하지 못한 축은 measured=false이고 score·raw·rawUnit이 null입니다.
			""")
	ApiResponse<SessionReportDetailResponse> getDetail(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 리포트 ID", example = "21") @Positive Long reportId);
}
