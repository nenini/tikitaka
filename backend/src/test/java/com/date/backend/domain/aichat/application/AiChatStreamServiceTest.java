package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatMessageSenderType;
import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.domain.ChatbotPersona;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamer;
import com.date.backend.domain.aichat.repository.AiChatMessageRepository;
import com.date.backend.domain.aichat.repository.AiChatSessionRepository;
import com.date.backend.domain.aichat.repository.ChatbotPersonaRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.domain.user.repository.UserRepository;
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

import static org.assertj.core.api.Assertions.assertThat;
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

	@BeforeEach
	void setUp() {
		User user = userRepository.save(new User(
				"ai-stream-" + System.nanoTime() + "@example.com",
				"password-hash",
				"SSE 사용자",
				null,
				LocalDate.of(2000, 1, 1)
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
			java.util.function.Consumer<String> consumer = invocation.getArgument(1);
			consumer.accept("안녕");
			consumer.accept("하세요");
			return null;
		}).when(responseStreamer).stream(any(), any());

		String body = performStream();

		assertThat(body)
				.containsSubsequence(
						"event:connected",
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
