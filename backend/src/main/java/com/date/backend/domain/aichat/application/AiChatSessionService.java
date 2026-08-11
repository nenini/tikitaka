package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import com.date.backend.domain.aichat.domain.AiResponseState;
import com.date.backend.domain.aichat.dto.request.AiChatSessionCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCreateResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCloseResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionSummaryResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionDetailResponse;
import com.date.backend.domain.aichat.dto.response.AiChatMessageResponse;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import com.date.backend.domain.aichat.repository.AiChatMessageRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AiChatErrorCode;
import com.date.backend.global.exception.code.CommonErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class AiChatSessionService {
	private final UserRepository userRepository;
	private final AiChatSessionRepository sessionRepository;
	private final AiChatMessageRepository messageRepository;

	public AiChatSessionService(
			UserRepository userRepository,
			AiChatSessionRepository sessionRepository,
			AiChatMessageRepository messageRepository
	) {
		this.userRepository = userRepository;
		this.sessionRepository = sessionRepository;
		this.messageRepository = messageRepository;
	}

	public List<AiChatSessionSummaryResponse> getSessions(Long userId) {
		return getSessions(userId, null);
	}

	public List<AiChatSessionSummaryResponse> getSessions(
			Long userId,
			com.date.backend.domain.aichat.domain.ChatSessionPurpose purpose
	) {
		var sessions = purpose == null
				? sessionRepository.findAllByUser_IdOrderByCreatedAtDesc(userId)
				: sessionRepository.findAllByUser_IdAndPurposeOrderByCreatedAtDesc(userId, purpose);
		return sessions.stream()
				.map(this::toSummary)
				.toList();
	}

	public AiChatSessionDetailResponse getSession(Long userId, Long sessionId) {
		AiChatSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new BusinessException(AiChatErrorCode.CHAT_SESSION_NOT_FOUND));
		if (!session.getUser().getId().equals(userId)) {
			throw new BusinessException(AiChatErrorCode.CHAT_SESSION_FORBIDDEN);
		}
		List<AiChatMessageResponse> messages =
				messageRepository.findAllBySession_IdOrderBySequenceNoAsc(sessionId).stream()
						.map(AiChatMessageResponse::from)
						.toList();
		return new AiChatSessionDetailResponse(toSummary(session), messages);
	}

	private AiChatSessionSummaryResponse toSummary(AiChatSession session) {
		var messages = messageRepository.findAllBySession_IdOrderBySequenceNoAsc(session.getId());
		String lastMessage = messages.isEmpty()
				? null
				: messages.get(messages.size() - 1).getMessageText();
		return AiChatSessionSummaryResponse.from(session, lastMessage, messages.size());
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
		if (session.getAiResponseState() == AiResponseState.PROCESSING) {
			throw new BusinessException(AiChatErrorCode.AI_RESPONSE_ALREADY_IN_PROGRESS);
		}
		session.close(LocalDateTime.now());
		return AiChatSessionCloseResponse.from(session);
	}
}
