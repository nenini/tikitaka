package com.date.backend.domain.result.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

public record PeerEvaluationSubmitResponse(
		Long evaluationId,
		Long sessionId,
		String status,
		boolean allSubmitted,
		@Schema(description = "양측 평가 완료 이벤트 발행 여부이며 실제 리포트 생성 완료 여부가 아닙니다.")
		boolean reportRequested,
		LocalDateTime submittedAt
) {
}
