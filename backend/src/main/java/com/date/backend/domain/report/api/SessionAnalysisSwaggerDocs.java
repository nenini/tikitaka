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
			description = "AI 서버가 Backend로 분석 결과를 전달하는 내부 콜백 API입니다. 프론트에서는 호출하지 않습니다. "
					+ "멱등 기준은 sessionId와 전체 analysisVersion입니다. 동일 버전·동일 payload 재전송은 duplicate=true이고, 동일 버전의 다른 payload는 409입니다. "
					+ "coverage 비율은 0~1이며 speechRecognitionRate는 null일 수 있습니다. fillerBreakdown 합계는 fillerCount와 같아야 합니다."
	)
	ApiResponse<SessionAnalysisAcceptedResponse> receive(
			@RequestBody(required = true, description = "AI 서버가 분석 완료 후 전송하는 참여자별 원본 분석 결과",
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
								      "question": {"score": null, "measured": false, "raw": null, "rawUnit": null, "note": "측정 불가"},
								      "listening": {"score": 4.25, "measured": true, "raw": 2.0, "rawUnit": "COUNT_PER_30_MINUTES", "note": "말 끊기 2회"},
								      "reaction": {"score": 4.17, "measured": true, "raw": 16.0, "rawUnit": "COUNT_PER_30_MINUTES", "note": "미소와 맞장구 16회"},
								      "balance": {"score": 4.50, "measured": true, "raw": 0.575, "rawUnit": "RATIO", "note": "발화 비율 57.5%"},
								      "nonverbal": {"score": 3.20, "measured": true, "raw": 10.0, "rawUnit": "COUNT_PER_30_MINUTES", "note": "시선 또는 얼굴 이탈 10회"}
								    },
								    "metrics": {
								      "speakingMs": 529509, "speakingRatio": 0.575,
								      "longSilenceCount": 8, "silenceThresholdMs": 10000,
								      "interruptionCount": 2, "backchannelCount": 9,
								      "fillerCount": 32, "questionCount": null,
								      "smileEpisodeCount": 7, "gazeAwayCount": 9,
								      "faceMissingCount": 1, "visionMeasured": true,
								      "coverage": {"faceDetectionRate": 0.82, "speechRecognitionRate": null, "cameraUptimeRate": 0.76},
								      "fillerBreakdown": {"뭐": 16, "그니까": 6, "약간": 10}
								    },
								    "evidenceSegments": []
								  }]
								}
								""")))
			SessionAnalysisRequest request
	);
}
