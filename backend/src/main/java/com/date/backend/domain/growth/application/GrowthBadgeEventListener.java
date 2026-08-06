package com.date.backend.domain.growth.application;

import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.event.SessionEndedEvent;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;

@Component
public class GrowthBadgeEventListener {
    private final GrowthBadgeService service;
    private final RoomParticipantRepository participantRepository;
    public GrowthBadgeEventListener(GrowthBadgeService service, RoomParticipantRepository participantRepository) {
        this.service=service; this.participantRepository=participantRepository;
    }
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSessionEnded(SessionEndedEvent event) {
        if (event.payload().status() != RoomSessionStatus.COMPLETED) return;
        participantRepository.findAllByRoom_IdOrderByUserIdAsc(event.payload().sessionId())
                .forEach(participant -> service.evaluateAndAward(participant.getUserId()));
    }
}
