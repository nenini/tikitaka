package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.domain.ChatbotPersona;
import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.dto.request.AiChatSessionCreateRequest;
import com.date.backend.domain.aichat.application.AiChatSessionService;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:ai-chat-api-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AiChatSessionControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ChatbotPersonaRepository personaRepository;

	@Autowired
	private AiChatSessionService sessionService;

	private UsernamePasswordAuthenticationToken authentication;
	private Long userId;
	private Long personaId;

	@BeforeEach
	void setUp() {
		User user = userRepository.save(new User(
				"ai-chat-api@example.com",
				"password-hash",
				"API 테스트 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		ChatbotPersona persona = personaRepository.save(new ChatbotPersona(
				"밝은 소개팅 상대",
				"존댓말",
				"BEGINNER",
				"BRIGHT",
				"NORMAL",
				"밝은 소개팅 연습 상대 역할을 수행합니다."
		));
		AuthUser authUser = new AuthUser(user.getId(), user.getEmail(), UserRole.USER);
		authentication = new UsernamePasswordAuthenticationToken(
				authUser,
				null,
				List.of(new SimpleGrantedAuthority("ROLE_USER"))
		);
		userId = user.getId();
		personaId = persona.getId();
	}

	@Test
	void authenticatedUserCreatesChatSession() throws Exception {
		mockMvc.perform(post("/api/v1/ai-chat/sessions")
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "purpose": "DATE_PRACTICE"
								}
								"""))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.success").value(true))
				.andExpect(jsonPath("$.data.sessionId").isNumber())
				.andExpect(jsonPath("$.data.aiPersonaKey").isEmpty())
				.andExpect(jsonPath("$.data.purpose").value("DATE_PRACTICE"))
				.andExpect(jsonPath("$.data.stage").value("INTRO"))
				.andExpect(jsonPath("$.data.status").value("ACTIVE"));
	}

	@Test
	void unauthenticatedUserCannotCreateChatSession() throws Exception {
		mockMvc.perform(post("/api/v1/ai-chat/sessions")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "purpose": "DATE_PRACTICE"
								}
								"""))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void invalidRequestIsRejected() throws Exception {
		mockMvc.perform(post("/api/v1/ai-chat/sessions")
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{}
								"""))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	void duplicateActiveSessionReturnsConflict() throws Exception {
		String requestBody = """
				{
				  "purpose": "DATE_PRACTICE"
				}
				""";

		mockMvc.perform(post("/api/v1/ai-chat/sessions")
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content(requestBody))
				.andExpect(status().isCreated());

		mockMvc.perform(post("/api/v1/ai-chat/sessions")
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content(requestBody))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ACTIVE_CHAT_SESSION_EXISTS"));
	}

	@Test
	void ownerCanCloseSessionRepeatedlyWithSameClosedAt() throws Exception {
		Long sessionId = sessionService.create(
				userId,
				new AiChatSessionCreateRequest(ChatSessionPurpose.DATE_PRACTICE)
		).sessionId();

		String firstClosedAt = mockMvc.perform(patch(
								"/api/v1/ai-chat/sessions/{sessionId}/close",
								sessionId
						)
						.with(authentication(authentication)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("COMPLETED"))
				.andExpect(jsonPath("$.data.closedAt").isNotEmpty())
				.andReturn()
				.getResponse()
				.getContentAsString();

		mockMvc.perform(patch(
							"/api/v1/ai-chat/sessions/{sessionId}/close",
							sessionId
						)
						.with(authentication(authentication)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.status").value("COMPLETED"))
				.andExpect(content().json(firstClosedAt));
	}

	@Test
	void ownerCanReadSessionListAndDetail() throws Exception {
		Long sessionId = sessionService.create(
				userId,
				new AiChatSessionCreateRequest(ChatSessionPurpose.DATE_PRACTICE)
		).sessionId();

		mockMvc.perform(get("/api/v1/ai-chat/sessions")
						.with(authentication(authentication)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data[0].sessionId").value(sessionId))
				.andExpect(jsonPath("$.data[0].aiResponseState").value("IDLE"));

		mockMvc.perform(get("/api/v1/ai-chat/sessions/{sessionId}", sessionId)
						.with(authentication(authentication)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.session.sessionId").value(sessionId))
				.andExpect(jsonPath("$.data.messages").isArray());
	}
}
