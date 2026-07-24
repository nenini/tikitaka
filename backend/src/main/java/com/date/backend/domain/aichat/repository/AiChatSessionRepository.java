package com.date.backend.domain.aichat.repository;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiChatSessionRepository extends JpaRepository<AiChatSession, Long> {
	boolean existsByUser_IdAndStatus(Long userId, ChatSessionStatus status);
}
