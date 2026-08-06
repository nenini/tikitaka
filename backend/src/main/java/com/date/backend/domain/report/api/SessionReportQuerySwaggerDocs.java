package com.date.backend.domain.report.api;

import com.date.backend.domain.report.dto.response.*;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Positive;

@Tag(name = "AI Report", description = "인증 사용자의 세션 AI 리포트 생성·상태·조회·삭제 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface SessionReportQuerySwaggerDocs {
	@Operation(summary = "AI 리포트 생성 요청", description = "종료된 세션의 본인 리포트 생성을 요청합니다. 진행 중이거나 완료된 요청은 기존 상태를 반환하며, 이전 요청이 실패했다면 다시 생성 요청합니다.")
	ApiResponse<SessionReportStatusResponse> requestGeneration(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "종료된 화상 세션 ID", example = "15") @Positive Long sessionId);

	@Operation(summary = "AI 리포트 생성 상태 조회", description = "PENDING·GENERATING·COMPLETED·FAILED 상태와 실패 코드 및 처리 시각을 조회합니다.")
	ApiResponse<SessionReportStatusResponse> getStatus(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15") @Positive Long sessionId);

	@Operation(summary = "세션 AI 리포트 종합 조회", description = "세션 참여자가 자신의 상태, 6축 요약, 강점과 개선점을 조회합니다. 미생성 상태는 REPORT_NOT_FOUND로 응답합니다.")
	ApiResponse<SessionReportSummaryResponse> getBySession(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "화상 세션 ID", example = "15") @Positive Long sessionId);

	@Operation(summary = "AI 리포트 상세 조회", description = "리포트 소유자가 전체 행동 지표, 다음 미션과 근거 구간을 조회합니다. 측정하지 못한 축은 measured=false이고 점수는 null입니다.")
	ApiResponse<SessionReportDetailResponse> getDetail(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 리포트 ID", example = "21") @Positive Long reportId);

	@Operation(summary = "리포트 세부 분석 항목 조회", description = "6축 중 한 항목과 관련 원본 지표·근거 구간을 조회합니다. axisCode는 flow, question, listening, reaction, balance, nonverbal 중 하나입니다.")
	ApiResponse<ReportAxisDetailResponse> getAxis(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 리포트 ID", example = "21") @Positive Long reportId,
			@Parameter(description = "분석 축 코드", example = "flow") String axisCode);

	@Operation(summary = "본인 AI 리포트 삭제", description = "완료 또는 실패한 본인 리포트 결과를 영구 삭제합니다. AI 원본 분석 지표는 감사 목적으로 보존하며, 생성 중 삭제는 409로 거부합니다. 삭제한 사용자 리포트는 다시 생성할 수 없습니다.")
	ApiResponse<SessionReportDeleteResponse> delete(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "AI 리포트 ID", example = "21") @Positive Long reportId);
}
