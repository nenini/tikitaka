package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.event.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;

@Component
public class MannerTemperatureEventListener {
    private final MannerTemperatureService service;
    public MannerTemperatureEventListener(MannerTemperatureService service) { this.service = service; }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onEvaluation(PeerEvaluationSubmittedEvent event) {
        service.applyEvaluation(event.evaluationId(), event.sessionId(), event.evaluateeUserId(),
                event.comfortScore(), event.questionConnectionScore(), event.listeningScore(),
                event.reactionScore(), event.balanceScore(), event.mannerScore(), event.submittedAt());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onNoShow(NoShowConfirmedEvent event) {
        service.applyNoShow(event.attendancePenaltyId(), event.sessionId(), event.userId(), event.confirmedAt());
    }
}
