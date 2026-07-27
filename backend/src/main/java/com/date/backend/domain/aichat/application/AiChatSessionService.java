package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import com.date.backend.domain.aichat.dto.request.AiChatSessionCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCreateResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCloseResponse;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AiChatErrorCode;
import com.date.backend.global.exception.code.CommonErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@Transactional(readOnly = true)
public class AiChatSessionService {
	private final UserRepository userRepository;
	private final AiChatSessionRepository sessionRepository;

	public AiChatSessionService(
			UserRepository userRepository,
			AiChatSessionRepository sessionRepository
	) {
		this.userRepository = userRepository;
		this.sessionRepository = sessionRepository;
	}

	@Transactional
	public AiChatSessionCreateResponse create(
			Long userId,
			AiChatSessionCreateRequest request
	) {
		User user = userRepository.findByIdForUpdate(userId)
				.orElseThrow(() -> new BusinessException(CommonErrorCode.RESOURCE_NOT_FOUND));
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
		if (sessionRepository.existsByUser_IdAndStatus(userId, ChatSessionStatus.ACTIVE)) {
			throw new BusinessException(AiChatErrorCode.ACTIVE_CHAT_SESSION_EXISTS);
		}

		AiChatSession session = sessionRepository.save(
				new AiChatSession(user, request.purpose())
		);
		return AiChatSessionCreateResponse.from(session);
	}

	@Transactional
	public AiChatSessionCloseResponse close(Long userId, Long sessionId) {
		AiChatSession session = sessionRepository.findByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(AiChatErrorCode.CHAT_SESSION_NOT_FOUND));
		if (!session.getUser().getId().equals(userId)) {
			throw new BusinessException(AiChatErrorCode.CHAT_SESSION_FORBIDDEN);
		}
		session.close(LocalDateTime.now());
		return AiChatSessionCloseResponse.from(session);
	}
}
