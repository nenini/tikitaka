package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatMessage;
import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.AiResponseState;
import com.date.backend.domain.aichat.domain.ChatMessageSenderType;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import com.date.backend.domain.aichat.dto.response.AiChatMessageResponse;
import com.date.backend.domain.aichat.repository.AiChatMessageRepository;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AiChatErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiChatTurnService {
	private final AiChatSessionRepository sessionRepository;
	private final AiChatMessageRepository messageRepository;

	public AiChatTurnService(
			AiChatSessionRepository sessionRepository,
			AiChatMessageRepository messageRepository
	) {
		this.sessionRepository = sessionRepository;
		this.messageRepository = messageRepository;
	}

	@Transactional
	public AiChatMessageResponse startNewTurn(Long userId, Long sessionId, String messageText) {
		AiChatSession session = findOwnedSessionForUpdate(userId, sessionId);
		validateActive(session);
		validateNotProcessing(session);

		long nextSequence = messageRepository.findMaxSequenceNo(sessionId) + 1;
		AiChatMessage userMessage = messageRepository.saveAndFlush(new AiChatMessage(
				session,
				ChatMessageSenderType.USER,
				messageText,
				nextSequence,
				false
		));
		session.recordUserMessage(userMessage.getCreatedAt());
		session.startAiResponse(userMessage.getId());
		return AiChatMessageResponse.from(userMessage);
	}

	@Transactional
	public AiChatMessageResponse startRetry(Long userId, Long sessionId, Long userMessageId) {
		AiChatSession session = findOwnedSessionForUpdate(userId, sessionId);
		validateActive(session);
		if ((session.getAiResponseState() != AiResponseState.FAILED
				&& session.getAiResponseState() != AiResponseState.CANCELLED)
				|| !userMessageId.equals(session.getPendingUserMessageId())) {
			throw new BusinessException(AiChatErrorCode.AI_RESPONSE_RETRY_NOT_ALLOWED);
		}
		AiChatMessage userMessage = messageRepository.findByIdAndSession_Id(userMessageId, sessionId)
				.filter(message -> message.getSenderType() == ChatMessageSenderType.USER)
				.orElseThrow(() -> new BusinessException(AiChatErrorCode.AI_RESPONSE_RETRY_NOT_ALLOWED));
		session.startAiResponse(userMessageId);
		return AiChatMessageResponse.from(userMessage);
	}

	@Transactional
	public AiChatMessageResponse complete(
			Long userId,
			Long sessionId,
			Long userMessageId,
			String responseText
	) {
		AiChatSession session = findOwnedSessionForUpdate(userId, sessionId);
		if (session.getAiResponseState() != AiResponseState.PROCESSING
				|| !userMessageId.equals(session.getPendingUserMessageId())) {
			throw new BusinessException(AiChatErrorCode.AI_RESPONSE_RETRY_NOT_ALLOWED);
		}
		long nextSequence = messageRepository.findMaxSequenceNo(sessionId) + 1;
		AiChatMessage aiMessage = messageRepository.saveAndFlush(new AiChatMessage(
				session,
				ChatMessageSenderType.AI,
				responseText,
				nextSequence,
				false
		));
		session.completeAiResponse(userMessageId);
		return AiChatMessageResponse.from(aiMessage);
	}

	@Transactional
	public void fail(Long userId, Long sessionId, Long userMessageId, String errorCode) {
		AiChatSession session = findOwnedSessionForUpdate(userId, sessionId);
		session.failAiResponse(userMessageId, errorCode);
	}

	@Transactional
	public void cancel(Long userId, Long sessionId, Long userMessageId) {
		AiChatSession session = findOwnedSessionForUpdate(userId, sessionId);
		if (session.getAiResponseState() != AiResponseState.PROCESSING
				|| !userMessageId.equals(session.getPendingUserMessageId())) {
			throw new BusinessException(AiChatErrorCode.AI_RESPONSE_CANCEL_NOT_ALLOWED);
		}
		session.cancelAiResponse(userMessageId);
	}

	@Transactional
	public void cancelIfProcessing(Long userId, Long sessionId, Long userMessageId) {
		AiChatSession session = findOwnedSessionForUpdate(userId, sessionId);
		if (session.getAiResponseState() == AiResponseState.PROCESSING
				&& userMessageId.equals(session.getPendingUserMessageId())) {
			session.cancelAiResponse(userMessageId);
		}
	}

	private AiChatSession findOwnedSessionForUpdate(Long userId, Long sessionId) {
		AiChatSession session = sessionRepository.findByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(AiChatErrorCode.CHAT_SESSION_NOT_FOUND));
		if (!session.getUser().getId().equals(userId)) {
			throw new BusinessException(AiChatErrorCode.CHAT_SESSION_FORBIDDEN);
		}
		return session;
	}

	private void validateActive(AiChatSession session) {
		if (session.getStatus() != ChatSessionStatus.ACTIVE) {
			throw new BusinessException(AiChatErrorCode.CHAT_SESSION_CLOSED);
		}
	}

	private void validateNotProcessing(AiChatSession session) {
		if (session.getAiResponseState() == AiResponseState.PROCESSING) {
			throw new BusinessException(AiChatErrorCode.AI_RESPONSE_ALREADY_IN_PROGRESS);
		}
	}
}
