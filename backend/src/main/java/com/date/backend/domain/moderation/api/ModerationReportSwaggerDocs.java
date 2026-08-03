package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.dto.request.ModerationReportCreateRequest;
import com.date.backend.domain.moderation.dto.response.ModerationReportResponse;
import com.date.backend.global.api.ApiResponse;
import com.date.backend.global.config.OpenApiConfig;
import com.date.backend.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@Tag(name = "Moderation", description = "세션 참여자 신고 API")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public interface ModerationReportSwaggerDocs {
	@Operation(summary = "세션 기반 사용자 신고 접수", description = """
			세션 참여자가 신고 종류와 문제가 된 부분의 텍스트 설명을 제출합니다.
			신고는 즉시 접수되며 진행 중인 세션에서는 AI 서버를 바로 호출하지 않습니다.
			세션 종료 후 신고가 존재할 때만 백엔드가 AI 서버의 전체 STT 원문을 조회해 CHAT_TRANSCRIPT 증거로 저장합니다.
			사용자는 스크린샷이나 증거 파일을 직접 첨부하지 않습니다.
			AI STT 조회 실패는 신고 접수를 취소하지 않으며 백그라운드 재시도와 서버 로그로 처리합니다.
			동일 세션에서 같은 신고자가 같은 사용자를 다시 신고하면 409를 반환합니다.
			""")
	@ApiResponses({
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "신고 접수 성공"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "잘못된 요청 또는 피신고자가 세션 참여자가 아님"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "신고자가 세션 참여자가 아님"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "세션을 찾을 수 없음"),
			@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "동일 세션·대상 중복 신고")
	})
	ApiResponse<ModerationReportResponse> create(
			@Parameter(hidden = true) AuthUser authUser,
			@Valid ModerationReportCreateRequest request
	);
}
