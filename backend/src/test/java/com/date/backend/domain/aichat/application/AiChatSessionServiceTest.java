package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import com.date.backend.domain.aichat.domain.ChatbotPersona;
import com.date.backend.domain.aichat.domain.ConversationStage;
import com.date.backend.domain.aichat.dto.request.AiChatSessionCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCreateResponse;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCloseResponse;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:ai-chat-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class AiChatSessionServiceTest {

	@Autowired
	private AiChatSessionService sessionService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private AiChatMessageService messageService;

	@Autowired
	private ChatbotPersonaRepository personaRepository;

	private Long userId;
	private Long personaId;

	@BeforeEach
	void setUp() {
		User user = userRepository.save(new User(
				"ai-chat-service@example.com",
				"password-hash",
				"AI 채팅 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		ChatbotPersona persona = personaRepository.save(new ChatbotPersona(
				"차분한 소개팅 상대",
				"존댓말",
				"BEGINNER",
				"CALM",
				"NORMAL",
				"소개팅 연습 상대 역할을 수행합니다."
		));
		userId = user.getId();
		personaId = persona.getId();
	}

	@Test
	void authenticatedUserCanCreateActiveChatSession() {
		AiChatSessionCreateResponse response = sessionService.create(
				userId,
				new AiChatSessionCreateRequest(ChatSessionPurpose.DATE_PRACTICE)
		);

		assertThat(response.sessionId()).isNotNull();
		assertThat(response.aiPersonaKey()).isNull();
		assertThat(response.purpose()).isEqualTo(ChatSessionPurpose.DATE_PRACTICE);
		assertThat(response.stage()).isEqualTo(ConversationStage.INTRO);
		assertThat(response.status()).isEqualTo(ChatSessionStatus.ACTIVE);
		assertThat(response.createdAt()).isNotNull();
	}

	@Test
	void secondActiveChatSessionIsRejected() {
		AiChatSessionCreateRequest request =
				new AiChatSessionCreateRequest(ChatSessionPurpose.DATE_PRACTICE);
		sessionService.create(userId, request);

		BusinessException exception = catchThrowableOfType(
				() -> sessionService.create(userId, request),
				BusinessException.class
		);

		assertThat(exception.getErrorCode())
				.isEqualTo(AiChatErrorCode.ACTIVE_CHAT_SESSION_EXISTS);
	}

	@Test
	void ownerCanCloseSessionAndRepeatedRequestKeepsOriginalClosedAt() {
		Long sessionId = sessionService.create(
				userId,
				new AiChatSessionCreateRequest(ChatSessionPurpose.DATE_PRACTICE)
		).sessionId();

		AiChatSessionCloseResponse firstResponse = sessionService.close(userId, sessionId);
		AiChatSessionCloseResponse secondResponse = sessionService.close(userId, sessionId);

		assertThat(firstResponse.status()).isEqualTo(ChatSessionStatus.COMPLETED);
		assertThat(firstResponse.closedAt()).isNotNull();
		assertThat(secondResponse.status()).isEqualTo(ChatSessionStatus.COMPLETED);
		assertThat(secondResponse.closedAt()).isEqualTo(firstResponse.closedAt());
	}

	@Test
	void nonOwnerCannotCloseSession() {
		Long sessionId = sessionService.create(
				userId,
				new AiChatSessionCreateRequest(ChatSessionPurpose.DATE_PRACTICE)
		).sessionId();
		User otherUser = userRepository.save(new User(
				"ai-chat-other@example.com",
				"password-hash",
				"다른 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));

		BusinessException exception = catchThrowableOfType(
				() -> sessionService.close(otherUser.getId(), sessionId),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(AiChatErrorCode.CHAT_SESSION_FORBIDDEN);
	}

	@Test
	void ownerCanReadSessionListAndDetailWithMessages() {
		Long sessionId = sessionService.create(
				userId,
				new AiChatSessionCreateRequest(ChatSessionPurpose.DATE_PRACTICE)
		).sessionId();
		messageService.saveUserMessage(userId, sessionId, "안녕하세요");
		messageService.saveAiMessage(userId, sessionId, "반갑습니다");

		var sessions = sessionService.getSessions(userId);
		var detail = sessionService.getSession(userId, sessionId);

		assertThat(sessions).hasSize(1);
		assertThat(sessions.get(0).lastMessage()).isEqualTo("반갑습니다");
		assertThat(sessions.get(0).messageCount()).isEqualTo(2);
		assertThat(detail.session().sessionId()).isEqualTo(sessionId);
		assertThat(detail.messages())
				.extracting(message -> message.messageText())
				.containsExactly("안녕하세요", "반갑습니다");
	}
}
