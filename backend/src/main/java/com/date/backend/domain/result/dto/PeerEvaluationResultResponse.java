package com.date.backend.domain.result.dto;

import com.date.backend.domain.result.domain.PeerEvaluation;

import java.time.LocalDateTime;

public record PeerEvaluationResultResponse(
		Long sessionId,
		int comfortScore,
		int questionConnectionScore,
		int listeningScore,
		int reactionScore,
		int balanceScore,
		int mannerScore,
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
				evaluation.getSubmittedAt()
		);
	}
}
