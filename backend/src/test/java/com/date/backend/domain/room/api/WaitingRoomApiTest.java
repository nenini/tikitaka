package com.date.backend.domain.room.api;

import com.date.backend.domain.user.domain.UserRole;
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

import java.util.List;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:waiting-room-api-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WaitingRoomApiTest {

	@Autowired
	private MockMvc mockMvc;

	private UsernamePasswordAuthenticationToken authentication;

	@BeforeEach
	void setUp() {
		AuthUser authUser = new AuthUser(1L, "room-api@example.com", UserRole.USER);
		authentication = new UsernamePasswordAuthenticationToken(
				authUser,
				null,
				List.of(new SimpleGrantedAuthority("ROLE_USER"))
		);
	}

	@Test
	void missingRoomReturnsNotFoundInsteadOfValidationInternalError() throws Exception {
		mockMvc.perform(get("/api/v1/rooms/1")
						.with(authentication(authentication)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("ROOM_NOT_FOUND"));

		mockMvc.perform(post("/api/v1/rooms/1/device-check")
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "cameraPassed": true,
								  "microphonePassed": true,
								  "speakerPassed": true,
								  "networkPassed": true
								}
								"""))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("ROOM_NOT_FOUND"));
	}

	@Test
	void missingDeviceCheckFieldReturnsBadRequest() throws Exception {
		mockMvc.perform(post("/api/v1/rooms/1/device-check")
						.with(authentication(authentication))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "cameraPassed": true,
								  "microphonePassed": true,
								  "speakerPassed": true
								}
								"""))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}
}
