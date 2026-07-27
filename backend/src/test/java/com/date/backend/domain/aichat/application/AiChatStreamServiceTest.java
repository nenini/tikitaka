package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatMessageSenderType;
import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.domain.AiResponseState;
import com.date.backend.domain.aichat.domain.ChatbotPersona;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamer;
import com.date.backend.domain.aichat.integration.AiChatPersonaSelection;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamListener;
import com.date.backend.domain.aichat.repository.AiChatMessageRepository;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import com.date.backend.domain.aichat.repository.ChatbotPersonaRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.global.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:ai-chat-stream-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiChatStreamServiceTest {
	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ProfileRepository profileRepository;

	@Autowired
	private ChatbotPersonaRepository personaRepository;

	@Autowired
	private AiChatSessionRepository sessionRepository;

	@Autowired
	private AiChatMessageRepository messageRepository;

	@Autowired
	private AiChatStreamService streamService;

	@MockitoBean
	private AiChatResponseStreamer responseStreamer;

	private UsernamePasswordAuthenticationToken authentication;
	private Long sessionId;
	private Long userId;

	@BeforeEach
	void setUp() {
		User user = userRepository.save(new User(
				"ai-stream-" + System.nanoTime() + "@example.com",
				"password-hash",
				"SSE 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		profileRepository.save(new Profile(
				user.getId(),
				"stream-" + user.getId(),
				Gender.MALE,
				"Seoul"
		));
		ChatbotPersona persona = personaRepository.save(new ChatbotPersona(
				"SSE 대화 상대",
				"존댓말",
				"BEGINNER",
				"CALM",
				"NORMAL",
				"SSE 테스트용 대화 상대입니다."
		));
		sessionId = sessionRepository.save(
				new AiChatSession(user, persona, ChatSessionPurpose.DATE_PRACTICE)
		).getId();
		userId = user.getId();
		AuthUser authUser = new AuthUser(user.getId(), user.getEmail(), UserRole.USER);
		authentication = new UsernamePasswordAuthenticationToken(
				authUser,
				null,
				List.of(new SimpleGrantedAuthority("ROLE_USER"))
		);
	}

	@Test
	void aiChunksAreDeliveredInOrderAndCompletedResponseIsSaved() throws Exception {
		doAnswer(invocation -> {
			AiChatResponseStreamListener listener = invocation.getArgument(1);
			listener.onPersonaSelected(new AiChatPersonaSelection(
					"FEMALE_26_CALM_01",
					"차분한 상대"
			));
			listener.onChunk("안녕");
			listener.onChunk("하세요");
			return null;
		}).when(responseStreamer).stream(any(), any());

		String body = performStream();

		assertThat(body)
				.containsSubsequence(
						"event:connected",
						"event:persona",
						"\"personaKey\":\"FEMALE_26_CALM_01\"",
						"event:chunk",
						"\"sequence\":1",
						"\"content\":\"안녕\"",
						"event:chunk",
						"\"sequence\":2",
						"\"content\":\"하세요\"",
						"event:done"
				);
		assertThat(messageRepository.findAllBySession_IdOrderBySequenceNoAsc(sessionId))
				.extracting(message -> message.getSenderType() + ":" + message.getMessageText())
				.containsExactly(
						ChatMessageSenderType.USER + ":AI에게 인사해줘",
						ChatMessageSenderType.AI + ":안녕하세요"
				);
		assertThat(streamService.activeStreamCount()).isZero();
		assertThat(sessionRepository.findById(sessionId).orElseThrow().getAiResponseState())
				.isEqualTo(AiResponseState.IDLE);
	}

	@Test
	void aiFailureSendsErrorAndCleansUpStream() throws Exception {
		doThrow(new IllegalStateException("AI server unavailable"))
				.when(responseStreamer).stream(any(), any());

		String body = performStream();

		assertThat(body)
				.contains("event:error")
				.contains("\"code\":\"AI_RESPONSE_STREAM_FAILED\"");
		assertThat(messageRepository.findAllBySession_IdOrderBySequenceNoAsc(sessionId))
				.extracting(message -> message.getSenderType())
				.containsExactly(ChatMessageSenderType.USER);
		assertThat(streamService.activeStreamCount()).isZero();
		AiChatSession failedSession = sessionRepository.findById(sessionId).orElseThrow();
		assertThat(failedSession.getAiResponseState()).isEqualTo(AiResponseState.FAILED);
		assertThat(failedSession.getPendingUserMessageId()).isNotNull();
	}

	@Test
	void duplicateRequestIsRejectedAndRunningStreamCanBeCancelled() throws Exception {
		CountDownLatch started = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		doAnswer(invocation -> {
			started.countDown();
			release.await(5, TimeUnit.SECONDS);
			return null;
		}).when(responseStreamer).stream(any(), any());

		streamService.stream(userId, sessionId, "첫 번째 요청");
		assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();

		com.date.backend.global.exception.BusinessException duplicate = catchThrowableOfType(
				() -> streamService.stream(userId, sessionId, "중복 요청"),
				com.date.backend.global.exception.BusinessException.class
		);
		assertThat(duplicate.getErrorCode())
				.isEqualTo(com.date.backend.global.exception.code.AiChatErrorCode.AI_RESPONSE_ALREADY_IN_PROGRESS);

		var cancelled = streamService.cancel(userId, sessionId);
		release.countDown();

		assertThat(cancelled.responseState()).isEqualTo(AiResponseState.CANCELLED);
		assertThat(sessionRepository.findById(sessionId).orElseThrow().getAiResponseState())
				.isEqualTo(AiResponseState.CANCELLED);
		assertThat(streamService.activeStreamCount()).isZero();
	}

	@Test
	void retryWithoutFailedOrCancelledResponseReturnsDocumentedConflict() throws Exception {
		mockMvc.perform(post(
							"/api/v1/ai-chat/sessions/{sessionId}/responses/{userMessageId}/retry/stream",
							sessionId,
							1L
						)
						.with(authentication(authentication))
						.accept(MediaType.TEXT_EVENT_STREAM))
				.andExpect(status().isConflict())
				.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
						.content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
						.jsonPath("$.code").value("AI_RESPONSE_RETRY_NOT_ALLOWED"));
	}

	private String performStream() throws Exception {
		MvcResult asyncResult = mockMvc.perform(post(streamUrl())
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.accept(MediaType.TEXT_EVENT_STREAM)
						.content("""
								{
								  "messageText": "AI에게 인사해줘"
								}
								"""))
				.andExpect(request().asyncStarted())
				.andReturn();

		MvcResult completedResult = mockMvc.perform(asyncDispatch(asyncResult))
				.andExpect(status().isOk())
				.andReturn();
		return completedResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private String streamUrl() {
		return "/api/v1/ai-chat/sessions/" + sessionId + "/responses/stream";
	}
}
