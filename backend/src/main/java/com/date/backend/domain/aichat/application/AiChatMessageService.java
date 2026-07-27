package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatMessage;
import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatMessageSenderType;
import com.date.backend.domain.aichat.dto.request.AiChatMessageCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatMessageResponse;
import com.date.backend.domain.aichat.repository.AiChatMessageRepository;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AiChatErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class AiChatMessageService {
	private final AiChatSessionRepository sessionRepository;
	private final AiChatMessageRepository messageRepository;

	public AiChatMessageService(
			AiChatSessionRepository sessionRepository,
			AiChatMessageRepository messageRepository
	) {
		this.sessionRepository = sessionRepository;
		this.messageRepository = messageRepository;
	}

	@Transactional
	public AiChatMessageResponse save(
			Long userId,
			Long sessionId,
			AiChatMessageCreateRequest request
	) {
		AiChatSession session = sessionRepository.findByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(AiChatErrorCode.CHAT_SESSION_NOT_FOUND));
		validateOwner(userId, session);

		long nextSequence = messageRepository.findMaxSequenceNo(sessionId) + 1;
		AiChatMessage message = messageRepository.saveAndFlush(new AiChatMessage(
				session,
				request.senderType(),
				request.messageText(),
				nextSequence,
				request.proactive()
		));
		if (request.senderType() == ChatMessageSenderType.USER) {
			session.recordUserMessage(message.getCreatedAt());
		}
		return AiChatMessageResponse.from(message);
	}

	public List<AiChatMessageResponse> getMessages(Long userId, Long sessionId) {
		AiChatSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new BusinessException(AiChatErrorCode.CHAT_SESSION_NOT_FOUND));
		validateOwner(userId, session);
		return messageRepository.findAllBySession_IdOrderBySequenceNoAsc(sessionId).stream()
				.map(AiChatMessageResponse::from)
				.toList();
	}

	@Transactional
	public AiChatMessageResponse saveUserMessage(Long userId, Long sessionId, String messageText) {
		return save(
				userId,
				sessionId,
				new AiChatMessageCreateRequest(ChatMessageSenderType.USER, messageText, false)
		);
	}

	@Transactional
	public AiChatMessageResponse saveAiMessage(Long userId, Long sessionId, String messageText) {
		return save(
				userId,
				sessionId,
				new AiChatMessageCreateRequest(ChatMessageSenderType.AI, messageText, false)
		);
	}

	private void validateOwner(Long userId, AiChatSession session) {
		if (!session.getUser().getId().equals(userId)) {
			throw new BusinessException(AiChatErrorCode.CHAT_SESSION_FORBIDDEN);
		}
	}
}
