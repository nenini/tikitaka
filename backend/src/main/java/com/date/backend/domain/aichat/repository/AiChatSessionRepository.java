package com.date.backend.domain.aichat.repository;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface AiChatSessionRepository extends JpaRepository<AiChatSession, Long> {
	boolean existsByUser_IdAndStatus(Long userId, ChatSessionStatus status);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select session from AiChatSession session where session.id = :sessionId")
	Optional<AiChatSession> findByIdForUpdate(@Param("sessionId") Long sessionId);
}
