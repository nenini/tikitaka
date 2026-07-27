package com.date.backend.domain.aichat.api;

import com.date.backend.domain.aichat.domain.AiChatSession;
import com.date.backend.domain.aichat.domain.ChatSessionPurpose;
import com.date.backend.domain.aichat.domain.ChatbotPersona;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:ai-chat-message-api-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AiChatMessageControllerTest {
	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ChatbotPersonaRepository personaRepository;

	@Autowired
	private AiChatSessionRepository sessionRepository;

	private UsernamePasswordAuthenticationToken ownerAuthentication;
	private UsernamePasswordAuthenticationToken otherAuthentication;
	private Long sessionId;

	@BeforeEach
	void setUp() {
		User owner = saveUser("message-api-owner@example.com", "API 소유자");
		User other = saveUser("message-api-other@example.com", "API 다른 사용자");
		ChatbotPersona persona = personaRepository.save(new ChatbotPersona(
				"API 대화 상대",
				"존댓말",
				"BEGINNER",
				"BRIGHT",
				"NORMAL",
				"API 메시지 테스트용 상대입니다."
		));
		sessionId = sessionRepository.save(
				new AiChatSession(owner, persona, ChatSessionPurpose.DATE_PRACTICE)
		).getId();
		ownerAuthentication = buildAuthentication(owner);
		otherAuthentication = buildAuthentication(other);
	}

	@Test
	void ownerCanSaveAndReadMessagesInOrder() throws Exception {
		saveMessage("USER", "첫 번째 메시지")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.sequenceNo").value(1))
				.andExpect(jsonPath("$.data.senderType").value("USER"))
				.andExpect(jsonPath("$.data.createdAt").isNotEmpty());

		saveMessage("AI", "두 번째 메시지")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.sequenceNo").value(2));

		mockMvc.perform(get(messageUrl()).with(authentication(ownerAuthentication)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(2))
				.andExpect(jsonPath("$.data[0].messageText").value("첫 번째 메시지"))
				.andExpect(jsonPath("$.data[1].messageText").value("두 번째 메시지"));
	}

	@Test
	void nonOwnerCannotSaveOrReadMessages() throws Exception {
		mockMvc.perform(post(messageUrl())
						.with(authentication(otherAuthentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "senderType": "USER",
								  "messageText": "접근 시도",
								  "proactive": false
								}
								"""))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("CHAT_SESSION_FORBIDDEN"));

		mockMvc.perform(get(messageUrl()).with(authentication(otherAuthentication)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("CHAT_SESSION_FORBIDDEN"));
	}

	@Test
	void unauthenticatedUserCannotReadMessages() throws Exception {
		mockMvc.perform(get(messageUrl()))
				.andExpect(status().isUnauthorized());
	}

	private org.springframework.test.web.servlet.ResultActions saveMessage(
			String senderType,
			String messageText
	) throws Exception {
		return mockMvc.perform(post(messageUrl())
				.with(authentication(ownerAuthentication))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{
						  "senderType": "%s",
						  "messageText": "%s",
						  "proactive": false
						}
						""".formatted(senderType, messageText)));
	}

	private String messageUrl() {
		return "/api/v1/ai-chat/sessions/" + sessionId + "/messages";
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

	private UsernamePasswordAuthenticationToken buildAuthentication(User user) {
		AuthUser authUser = new AuthUser(user.getId(), user.getEmail(), UserRole.USER);
		return new UsernamePasswordAuthenticationToken(
				authUser,
				null,
				List.of(new SimpleGrantedAuthority("ROLE_USER"))
		);
	}
}
