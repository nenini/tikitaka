package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiChatRecoveryService {
	private static final Logger log = LoggerFactory.getLogger(AiChatRecoveryService.class);
	private static final String SERVER_RESTART_ERROR_CODE = "AI_RESPONSE_INTERRUPTED_BY_RESTART";

	private final AiChatSessionRepository sessionRepository;

	public AiChatRecoveryService(AiChatSessionRepository sessionRepository) {
		this.sessionRepository = sessionRepository;
	}

	@EventListener(ApplicationReadyEvent.class)
	@Transactional
	public void recoverInterruptedResponses() {
		int recovered = sessionRepository.failInterruptedResponses(SERVER_RESTART_ERROR_CODE);
		if (recovered > 0) {
			log.warn("Recovered interrupted AI responses after restart. count={}", recovered);
		}
	}
}
