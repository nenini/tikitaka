package com.date.backend.domain.room.repository;

import com.date.backend.domain.room.domain.LiveKitWebhookEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LiveKitWebhookEventRepository
		extends JpaRepository<LiveKitWebhookEvent, String> {
}
