package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.domain.ChatbotPersona;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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

	private UsernamePasswordAuthenticationToken authentication;
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
		personaId = persona.getId();
	}

	@Test
	void authenticatedUserCreatesChatSession() throws Exception {
		mockMvc.perform(post("/api/v1/ai-chat/sessions")
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "personaId": %d,
								  "purpose": "DATE_PRACTICE"
								}
								""".formatted(personaId)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.success").value(true))
				.andExpect(jsonPath("$.data.sessionId").isNumber())
				.andExpect(jsonPath("$.data.personaId").value(personaId))
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
								  "personaId": %d,
								  "purpose": "DATE_PRACTICE"
								}
								""".formatted(personaId)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void invalidRequestIsRejected() throws Exception {
		mockMvc.perform(post("/api/v1/ai-chat/sessions")
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "personaId": 0
								}
								"""))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	@Test
	void duplicateActiveSessionReturnsConflict() throws Exception {
		String requestBody = """
				{
				  "personaId": %d,
				  "purpose": "DATE_PRACTICE"
				}
				""".formatted(personaId);

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
}
