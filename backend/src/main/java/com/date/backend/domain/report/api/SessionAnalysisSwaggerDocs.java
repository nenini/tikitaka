package com.date.backend.domain.report.api;

import com.date.backend.domain.report.dto.request.SessionAnalysisRequest;
import com.date.backend.domain.report.dto.response.SessionAnalysisAcceptedResponse;
import com.date.backend.global.api.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Internal Session Analysis", description = "AI 서버 전용 세션 분석 결과 수신 API")
public interface SessionAnalysisSwaggerDocs {
	@Operation(
			summary = "세션 분석 원본 지표 수신",
			description = "AI 서버가 Backend로 분석 결과를 전달하는 내부 콜백 API입니다. 프론트엔드에서 호출하지 않습니다. "
					+ "schemaVersion은 AI-BE JSON 계약 버전이고, analysisVersion은 중복 수신과 재분석을 구분하는 분석 결과 버전입니다. "
					+ "세션 길이는 요청으로 받지 않고 Backend가 실제 시작·종료 시각으로 계산합니다. "
					+ "동일 세션·분석 버전 재전송은 duplicate=true로 응답하며, 내용이 달라지면 409로 거부합니다."
	)
	ApiResponse<SessionAnalysisAcceptedResponse> receive(
			@RequestBody(required = true, description = "AI 서버가 분석 완료 후 보내는 참여자별 원본 분석 결과",
					content = @io.swagger.v3.oas.annotations.media.Content(
							mediaType = "application/json",
							examples = @ExampleObject(name = "분석 성공 예시", value = """
								{
								  "schemaVersion": 1,
								  "analysisVersion": "analysis-v1.0.0",
								  "sessionId": 12345,
								  "analyzedAt": "2026-08-03T17:00:00+09:00",
								  "participants": [{
								    "userId": 1001,
								    "analysisStatus": "COMPLETED",
								    "axes": {
								      "flow": {"score": 3.50, "measured": true, "raw": 8.0, "rawUnit": "COUNT_PER_30_MINUTES", "note": "10초 이상 침묵 8회"},
								      "question": {"score": null, "measured": false, "raw": null, "rawUnit": null, "note": "STT 문장부호 미제공으로 측정 부족"},
								      "listening": {"score": 4.25, "measured": true, "raw": 2.0, "rawUnit": "COUNT_PER_30_MINUTES", "note": "말 끊기 2회"},
								      "reaction": {"score": 4.17, "measured": true, "raw": 16.0, "rawUnit": "COUNT_PER_30_MINUTES", "note": "미소와 맞장구 총 16회"},
								      "balance": {"score": 4.50, "measured": true, "raw": 0.575, "rawUnit": "RATIO", "note": "발화 비율 57.5%"},
								      "nonverbal": {"score": 3.20, "measured": true, "raw": 10.0, "rawUnit": "COUNT_PER_30_MINUTES", "note": "시선 또는 얼굴 이탈 10회"}
								    },
								    "metrics": {
								      "speakingMs": 529509, "speakingRatio": 0.575,
								      "longSilenceCount": 8, "silenceThresholdMs": 10000,
								      "interruptionCount": 2, "backchannelCount": 9,
								      "fillerCount": 32, "questionCount": null,
								      "smileEpisodeCount": 7, "gazeAwayCount": 9,
								      "faceMissingCount": 1, "visionMeasured": true
								    },
								    "evidenceSegments": []
								  }]
								}
								""")))
			SessionAnalysisRequest request
	);
}
