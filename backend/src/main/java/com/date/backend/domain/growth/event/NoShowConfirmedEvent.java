package com.date.backend.domain.growth.event;
import java.time.LocalDateTime;
public record NoShowConfirmedEvent(Long attendancePenaltyId, Long sessionId, Long userId, LocalDateTime confirmedAt) {}
