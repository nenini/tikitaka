package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.domain.ChatSessionStatus;
import com.date.backend.domain.aichat.domain.ChatbotPersona;
import com.date.backend.domain.aichat.domain.ConversationStage;
import com.date.backend.domain.aichat.dto.request.AiChatSessionCreateRequest;
import com.date.backend.domain.aichat.dto.response.AiChatSessionCreateResponse;
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
				new AiChatSessionCreateRequest(
						personaId,
						ChatSessionPurpose.DATE_PRACTICE
				)
		);

		assertThat(response.sessionId()).isNotNull();
		assertThat(response.personaId()).isEqualTo(personaId);
		assertThat(response.purpose()).isEqualTo(ChatSessionPurpose.DATE_PRACTICE);
		assertThat(response.stage()).isEqualTo(ConversationStage.INTRO);
		assertThat(response.status()).isEqualTo(ChatSessionStatus.ACTIVE);
		assertThat(response.createdAt()).isNotNull();
	}

	@Test
	void secondActiveChatSessionIsRejected() {
		AiChatSessionCreateRequest request = new AiChatSessionCreateRequest(
				personaId,
				ChatSessionPurpose.DATE_PRACTICE
		);
		sessionService.create(userId, request);

		BusinessException exception = catchThrowableOfType(
				() -> sessionService.create(userId, request),
				BusinessException.class
		);

		assertThat(exception.getErrorCode())
				.isEqualTo(AiChatErrorCode.ACTIVE_CHAT_SESSION_EXISTS);
	}
}
