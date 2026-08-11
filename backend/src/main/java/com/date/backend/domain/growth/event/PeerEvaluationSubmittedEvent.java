package com.date.backend.domain.growth.event;
import java.time.LocalDateTime;
public record PeerEvaluationSubmittedEvent(Long evaluationId, Long sessionId, Long evaluateeUserId,
        int comfortScore, int questionConnectionScore, int listeningScore, int reactionScore,
        int balanceScore, int mannerScore, LocalDateTime submittedAt) {}
