package com.date.backend.domain.report.api;

import com.date.backend.domain.report.dto.request.VoiceSessionAnalysisRequest;
import com.date.backend.domain.report.dto.request.VoiceSessionReportRequest;
import com.date.backend.domain.report.dto.response.VoiceSessionResultAcceptedResponse;
import com.date.backend.global.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Internal AI Video Report", description = "AI 서버 전용 5분 화상 연습 분석·리포트 수신 API")
public interface VoiceSessionResultSwaggerDocs {
	@Operation(summary = "AI 화상 세션 객관 지표 수신",
			description = "문장 리포트보다 먼저 객관 지표를 저장합니다. 측정 불가는 0이 아니라 null로 전송합니다.")
	ApiResponse<VoiceSessionResultAcceptedResponse> receiveAnalysis(
			@Parameter(description = "AI-BE 내부 인증 토큰", required = true) String internalToken,
			VoiceSessionAnalysisRequest request);

	@Operation(summary = "AI 화상 세션 문장 리포트 수신",
			description = "먼저 저장된 동일 analysisVersion의 객관 지표를 기준으로 문장 리포트를 저장합니다. notes는 0~3개입니다.")
	ApiResponse<VoiceSessionResultAcceptedResponse> receiveReport(
			@Parameter(description = "AI-BE 내부 인증 토큰", required = true) String internalToken,
			VoiceSessionReportRequest request);
}
