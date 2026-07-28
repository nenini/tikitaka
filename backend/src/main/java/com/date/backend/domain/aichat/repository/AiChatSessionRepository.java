package com.date.backend.domain.aichat.repository;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.List;

public interface AiChatSessionRepository extends JpaRepository<AiChatSession, Long> {
	boolean existsByUser_IdAndStatus(Long userId, ChatSessionStatus status);

	List<AiChatSession> findAllByUser_IdOrderByCreatedAtDesc(Long userId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select session from AiChatSession session where session.id = :sessionId")
	Optional<AiChatSession> findByIdForUpdate(@Param("sessionId") Long sessionId);

	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("""
			update AiChatSession session
			set session.aiResponseState = com.date.backend.domain.aichat.domain.AiResponseState.FAILED,
			    session.lastAiResponseErrorCode = :errorCode
			where session.aiResponseState = com.date.backend.domain.aichat.domain.AiResponseState.PROCESSING
			""")
	int failInterruptedResponses(@Param("errorCode") String errorCode);
}
