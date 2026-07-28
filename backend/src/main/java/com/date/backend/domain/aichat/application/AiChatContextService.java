package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.integration.AiChatHistoryMessage;
import com.date.backend.domain.aichat.integration.AiChatPersonaCondition;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamRequest;
import com.date.backend.domain.aichat.repository.AiChatMessageRepository;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AiChatErrorCode;
import com.date.backend.global.exception.code.ProfileErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;

@Service
@Transactional(readOnly = true)
public class AiChatContextService {
	private static final ZoneId SERVICE_ZONE_ID = ZoneId.of("Asia/Seoul");

	private final AiChatSessionRepository sessionRepository;
	private final AiChatMessageRepository messageRepository;
	private final ProfileRepository profileRepository;

	public AiChatContextService(
			AiChatSessionRepository sessionRepository,
			AiChatMessageRepository messageRepository,
			ProfileRepository profileRepository
	) {
		this.sessionRepository = sessionRepository;
		this.messageRepository = messageRepository;
		this.profileRepository = profileRepository;
	}

	public AiChatResponseStreamRequest createRequest(Long userId, Long sessionId) {
		AiChatSession session = findOwnedSession(userId, sessionId);
		Profile profile = findProfile(userId);
		int age = calculateAge(session);
		return new AiChatResponseStreamRequest(
				userId,
				sessionId,
				session.getPurpose(),
				new AiChatPersonaCondition(profile.getGender(), age),
				session.getAiPersonaKey(),
				messageRepository.findAllBySession_IdOrderBySequenceNoAsc(sessionId).stream()
						.map(message -> new AiChatHistoryMessage(
								message.getSequenceNo(),
								message.getSenderType(),
								message.getMessageText()
						))
						.toList()
		);
	}

	public void validateContext(Long userId, Long sessionId) {
		AiChatSession session = findOwnedSession(userId, sessionId);
		findProfile(userId);
		calculateAge(session);
	}

	@Transactional
	public void saveSelectedPersona(Long userId, Long sessionId, String personaKey) {
		AiChatSession session = sessionRepository.findByIdForUpdate(sessionId)
				.orElseThrow(() -> new BusinessException(AiChatErrorCode.CHAT_SESSION_NOT_FOUND));
		validateOwner(userId, session);
		session.selectAiPersona(personaKey);
	}

	private AiChatSession findOwnedSession(Long userId, Long sessionId) {
		AiChatSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new BusinessException(AiChatErrorCode.CHAT_SESSION_NOT_FOUND));
		validateOwner(userId, session);
		return session;
	}

	private Profile findProfile(Long userId) {
		Profile profile = profileRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(ProfileErrorCode.PROFILE_NOT_FOUND));
		return profile;
	}

	private int calculateAge(AiChatSession session) {
		LocalDate birthDate = session.getUser().getBirthDate();
		if (birthDate == null) {
			throw new BusinessException(AiChatErrorCode.AI_CHAT_PROFILE_INCOMPLETE);
		}
		return Period.between(birthDate, LocalDate.now(SERVICE_ZONE_ID)).getYears();
	}

	private void validateOwner(Long userId, AiChatSession session) {
		if (!session.getUser().getId().equals(userId)) {
			throw new BusinessException(AiChatErrorCode.CHAT_SESSION_FORBIDDEN);
		}
	}
}
