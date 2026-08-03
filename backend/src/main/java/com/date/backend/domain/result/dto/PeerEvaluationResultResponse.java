package com.date.backend.domain.result.dto;

import com.date.backend.domain.result.domain.PeerEvaluation;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

public record PeerEvaluationResultResponse(
		Long sessionId,
		int comfortScore,
		int questionConnectionScore,
		int listeningScore,
		int reactionScore,
		int balanceScore,
		int mannerScore,
		@Schema(description = "상대방이 작성한 잘했던 행동(선택)", nullable = true)
		String goodBehaviorText,
		@Schema(description = "상대방이 작성한 개선하면 좋을 행동(선택)", nullable = true)
		String improvementText,
		LocalDateTime submittedAt
) {
	public static PeerEvaluationResultResponse from(PeerEvaluation evaluation) {
		return new PeerEvaluationResultResponse(
				evaluation.getSessionId(),
				evaluation.getComfortScore(),
				evaluation.getQuestionConnectionScore(),
				evaluation.getListeningScore(),
				evaluation.getReactionScore(),
				evaluation.getBalanceScore(),
				evaluation.getMannerScore(),
				evaluation.getGoodBehaviorText(),
				evaluation.getImprovementText(),
				evaluation.getSubmittedAt()
		);
	}
}
