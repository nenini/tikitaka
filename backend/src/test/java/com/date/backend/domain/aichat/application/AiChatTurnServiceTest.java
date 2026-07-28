package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.AiResponseState;
import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.repository.AiChatMessageRepository;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
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
		"spring.datasource.url=jdbc:h2:mem:ai-chat-turn-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
@Transactional
class AiChatTurnServiceTest {
	@Autowired
	private AiChatTurnService turnService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private AiChatSessionRepository sessionRepository;

	@Autowired
	private AiChatMessageRepository messageRepository;

	private Long userId;
	private Long sessionId;

	@BeforeEach
	void setUp() {
		User user = userRepository.save(new User(
				"turn@example.com",
				"password",
				"턴 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		userId = user.getId();
		sessionId = sessionRepository.save(
				new AiChatSession(user, ChatSessionPurpose.DATE_PRACTICE)
		).getId();
	}

	@Test
	void processingTurnBlocksDuplicateAndSuccessfulCompletionReturnsIdle() {
		var userMessage = turnService.startNewTurn(userId, sessionId, "안녕하세요");

		BusinessException duplicate = catchThrowableOfType(
				() -> turnService.startNewTurn(userId, sessionId, "중복 메시지"),
				BusinessException.class
		);
		assertThat(duplicate.getErrorCode())
				.isEqualTo(AiChatErrorCode.AI_RESPONSE_ALREADY_IN_PROGRESS);

		turnService.complete(userId, sessionId, userMessage.messageId(), "반갑습니다");

		AiChatSession session = sessionRepository.findById(sessionId).orElseThrow();
		assertThat(session.getAiResponseState()).isEqualTo(AiResponseState.IDLE);
		assertThat(session.getPendingUserMessageId()).isNull();
		assertThat(messageRepository.findAllBySession_IdOrderBySequenceNoAsc(sessionId))
				.extracting(message -> message.getMessageText())
				.containsExactly("안녕하세요", "반갑습니다");
	}

	@Test
	void failedAndCancelledTurnsRetrySameUserMessageWithoutDuplicate() {
		var userMessage = turnService.startNewTurn(userId, sessionId, "다시 답해주세요");
		turnService.fail(userId, sessionId, userMessage.messageId(), "AI_RESPONSE_STREAM_FAILED");

		var retried = turnService.startRetry(userId, sessionId, userMessage.messageId());
		assertThat(retried.messageId()).isEqualTo(userMessage.messageId());
		assertThat(messageRepository.findAllBySession_IdOrderBySequenceNoAsc(sessionId)).hasSize(1);

		turnService.cancel(userId, sessionId, userMessage.messageId());
		AiChatSession cancelled = sessionRepository.findById(sessionId).orElseThrow();
		assertThat(cancelled.getAiResponseState()).isEqualTo(AiResponseState.CANCELLED);

		var retriedAfterCancel = turnService.startRetry(userId, sessionId, userMessage.messageId());
		assertThat(retriedAfterCancel.messageId()).isEqualTo(userMessage.messageId());
		assertThat(messageRepository.findAllBySession_IdOrderBySequenceNoAsc(sessionId)).hasSize(1);
	}
}
