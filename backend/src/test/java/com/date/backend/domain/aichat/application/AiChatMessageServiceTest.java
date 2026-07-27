package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatMessageSenderType;
import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.domain.ChatbotPersona;
import com.date.backend.domain.aichat.dto.request.AiChatMessageCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatMessageResponse;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import com.date.backend.domain.aichat.repository.ChatbotPersonaRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AiChatErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:ai-chat-message-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class AiChatMessageServiceTest {
	@Autowired
	private AiChatMessageService messageService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ChatbotPersonaRepository personaRepository;

	@Autowired
	private AiChatSessionRepository sessionRepository;

	private Long ownerId;
	private Long otherUserId;
	private Long sessionId;

	@BeforeEach
	void setUp() {
		User owner = saveUser("message-owner@example.com", "메시지 소유자");
		User otherUser = saveUser("message-other@example.com", "다른 사용자");
		ChatbotPersona persona = personaRepository.save(new ChatbotPersona(
				"대화 연습 상대",
				"존댓말",
				"BEGINNER",
				"CALM",
				"NORMAL",
				"소개팅 대화를 연습합니다."
		));
		AiChatSession session = sessionRepository.save(
				new AiChatSession(owner, persona, ChatSessionPurpose.DATE_PRACTICE)
		);
		ownerId = owner.getId();
		otherUserId = otherUser.getId();
		sessionId = session.getId();
	}

	@Test
	void userAndAiMessagesAreStoredAndReturnedInSequence() {
		AiChatMessageResponse userMessage = messageService.save(
				ownerId,
				sessionId,
				new AiChatMessageCreateRequest(ChatMessageSenderType.USER, "안녕하세요.", false)
		);
		AiChatMessageResponse aiMessage = messageService.save(
				ownerId,
				sessionId,
				new AiChatMessageCreateRequest(ChatMessageSenderType.AI, "반갑습니다.", false)
		);

		List<AiChatMessageResponse> messages = messageService.getMessages(ownerId, sessionId);

		assertThat(userMessage.sequenceNo()).isEqualTo(1L);
		assertThat(aiMessage.sequenceNo()).isEqualTo(2L);
		assertThat(messages).extracting(AiChatMessageResponse::messageText)
				.containsExactly("안녕하세요.", "반갑습니다.");
		assertThat(messages).extracting(AiChatMessageResponse::senderType)
				.containsExactly(ChatMessageSenderType.USER, ChatMessageSenderType.AI);
		assertThat(messages).allSatisfy(message -> assertThat(message.createdAt()).isNotNull());
	}

	@Test
	void nonOwnerCannotSaveOrReadMessages() {
		AiChatMessageCreateRequest request =
				new AiChatMessageCreateRequest(ChatMessageSenderType.USER, "접근 시도", false);

		BusinessException saveException = catchThrowableOfType(
				() -> messageService.save(otherUserId, sessionId, request),
				BusinessException.class
		);
		BusinessException readException = catchThrowableOfType(
				() -> messageService.getMessages(otherUserId, sessionId),
				BusinessException.class
		);

		assertThat(saveException.getErrorCode()).isEqualTo(AiChatErrorCode.CHAT_SESSION_FORBIDDEN);
		assertThat(readException.getErrorCode()).isEqualTo(AiChatErrorCode.CHAT_SESSION_FORBIDDEN);
	}

	@Test
	void messageCannotBeSavedAfterSessionIsClosed() {
		AiChatSession session = sessionRepository.findById(sessionId).orElseThrow();
		session.close(LocalDateTime.now());
		sessionRepository.saveAndFlush(session);

		BusinessException exception = catchThrowableOfType(
				() -> messageService.save(
						ownerId,
						sessionId,
						new AiChatMessageCreateRequest(
								ChatMessageSenderType.USER,
								"종료 후 메시지",
								false
						)
				),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(AiChatErrorCode.CHAT_SESSION_CLOSED);
	}

	private User saveUser(String email, String nickname) {
		return userRepository.save(new User(
				email,
				"password-hash",
				nickname,
				null,
				LocalDate.of(2000, 1, 1)
		));
	}
}
