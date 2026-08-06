package com.date.backend.domain.growth.api;

import com.date.backend.domain.growth.domain.GrowthSessionStatus;
import com.date.backend.domain.growth.dto.response.*;
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
    @Operation(summary = "세션 히스토리 조회", description = "본인이 참여한 완료·조기 종료 세션을 최신순으로 조회합니다. 상대 정보는 익명 처리하고 삭제된 리포트는 report.exists=false로 표시합니다.")
    ApiResponse<GrowthSessionHistoryResponse> getSessions(
            @Parameter(hidden = true) AuthUser authUser,
            @Parameter(description = "조회 시작일(포함)", example = "2026-07-01") LocalDate from,
            @Parameter(description = "조회 종료일(포함)", example = "2026-08-04") LocalDate to,
            @Parameter(description = "COMPLETED 또는 TERMINATED") GrowthSessionStatus status,
            @Parameter(description = "이전 응답의 nextCursor") @Positive Long cursor,
            @Parameter(description = "조회 개수(1~50)", example = "20") @Min(1) @Max(50) int size);

    @Operation(summary = "성장 지표 추세 조회", description = "완료 리포트의 흐름·질문·경청·반응·균형·비언어 6축 평균을 현재 기간과 직전 동일 기간으로 비교합니다. change는 현재 평균에서 이전 평균을 뺀 값입니다. 측정 불가 값은 평균에서 제외하고 null과 measured=false로 반환하여 0점과 구분합니다. 날짜를 생략하면 최근 30일을 조회합니다.")
    ApiResponse<GrowthMetricsResponse> getMetrics(
            @Parameter(hidden = true) AuthUser authUser,
            @Parameter(description = "현재 비교 기간 시작일(포함)", example = "2026-07-01") LocalDate from,
            @Parameter(description = "현재 비교 기간 종료일(포함)", example = "2026-07-30") LocalDate to);

    @Operation(summary = "내 매너 온도 조회", description = "기본 36.5°C에서 시작하는 현재 매너 온도와 최근 변경 이력 10건을 조회합니다. 평가와 노쇼는 정책 버전별로 한 번만 반영되며, 온도는 20.0~50.0°C 범위로 제한됩니다. 최근 변경에는 변경 전·후 온도, 실제 증감값, 세션·평가 또는 노쇼 원본 ID와 사유가 포함됩니다.")
    ApiResponse<UserTemperatureResponse> getTemperature(@Parameter(hidden = true) AuthUser authUser);

    @Operation(summary = "성장 뱃지 조회", description = "완료 세션과 완료 리포트 횟수를 기준으로 획득·미획득 뱃지와 진행률을 조회합니다. 조회 시 활성 뱃지 조건을 다시 판정하므로 기존 실적도 소급 반영됩니다. 비활성 뱃지는 신규 지급하지 않지만 이미 획득한 기록과 획득 시각은 유지됩니다.")
    ApiResponse<GrowthBadgesResponse> getBadges(@Parameter(hidden = true) AuthUser authUser);
}
