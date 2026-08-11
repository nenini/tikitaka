package com.date.backend.domain.report.api;

import com.date.backend.domain.report.dto.request.AiReportResultRequest;
import com.date.backend.domain.report.dto.response.AiReportResultAcceptedResponse;
import com.date.backend.global.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.*;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Internal Session Report", description = "AI 서버 전용 최종 리포트 결과 콜백 API")
public interface AiReportResultSwaggerDocs {
	@Operation(summary = "AI 최종 리포트 결과 수신", description = """
			AI 서버가 리포트 생성을 마친 뒤 Backend로 결과를 전달합니다. 프론트엔드에서 호출하지 않습니다.
			COMPLETED는 LLM 결과, FALLBACK은 규칙 기반 대체 결과, FAILED는 생성 실패를 의미합니다.
			동일한 세션·사용자·reportVersion과 동일한 결과 재전송은 중복 저장하지 않습니다.
			""")
	ApiResponse<AiReportResultAcceptedResponse> receive(
			@Parameter(required = true, description = "AI-BE 내부 인증 토큰")
			String internalToken,
			@RequestBody(required = true, content = @Content(mediaType = "application/json",
					examples = @ExampleObject(value = """
						{
						  "schemaVersion": 1,
						  "sessionId": 12345,
						  "analysisVersion": "analysis-v1.1.0",
						  "reportVersion": "report-v1.1.0",
						  "generatedAt": "2026-08-04T10:30:00+09:00",
						  "reports": [{
						    "userId": 1001,
						    "reportStatus": "COMPLETED",
						    "generationMode": "LLM",
						    "summaryText": "편안하고 자연스럽게 대화를 이어갔습니다.",
						    "strengths": ["상대의 이야기를 자연스럽게 되물었어요."],
						    "improvements": ["침묵 전에 새로운 주제를 제안해 보세요."],
						    "nextMissions": ["후속 질문을 한 번 이상 해보기"],
						    "failureCode": null,
						    "failureReason": null
						  }]
						}
						"""))) AiReportResultRequest request);
}
