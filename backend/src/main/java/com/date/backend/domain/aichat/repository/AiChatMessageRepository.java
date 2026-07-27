package com.date.backend.domain.aichat.repository;

import com.date.backend.domain.aichat.domain.AiChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AiChatMessageRepository extends JpaRepository<AiChatMessage, Long> {
	List<AiChatMessage> findAllBySession_IdOrderBySequenceNoAsc(Long sessionId);

	@Query("""
			select coalesce(max(message.sequenceNo), 0)
			from AiChatMessage message
			where message.session.id = :sessionId
			""")
	Long findMaxSequenceNo(@Param("sessionId") Long sessionId);
}
