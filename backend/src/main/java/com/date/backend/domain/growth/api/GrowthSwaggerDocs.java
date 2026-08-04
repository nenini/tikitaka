package com.date.backend.domain.growth.api;

import com.date.backend.domain.growth.domain.GrowthSessionStatus;
import com.date.backend.domain.growth.dto.response.GrowthSessionHistoryResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.*;
import java.time.LocalDate;

@Tag(name = "Growth", description = "사용자 성장 기록 조회 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface GrowthSwaggerDocs {
	@Operation(summary = "세션 히스토리 조회", description = "본인이 참여한 정상 완료·조기 종료 세션을 최신순으로 조회합니다. 진행 중이거나 입장하지 않은 세션은 제외하고 상대의 식별 정보는 익명 처리합니다. 삭제된 리포트는 report.exists=false로 표시합니다. 다음 페이지는 nextCursor를 cursor로 전달합니다.")
	ApiResponse<GrowthSessionHistoryResponse> getSessions(
			@Parameter(hidden = true) AuthUser authUser,
			@Parameter(description = "조회 시작일(포함)", example = "2026-07-01") LocalDate from,
			@Parameter(description = "조회 종료일(포함)", example = "2026-08-04") LocalDate to,
			@Parameter(description = "COMPLETED 또는 TERMINATED") GrowthSessionStatus status,
			@Parameter(description = "이전 응답의 nextCursor") @Positive Long cursor,
			@Parameter(description = "조회 개수(1~50)", example = "20") @Min(1) @Max(50) int size);
}
