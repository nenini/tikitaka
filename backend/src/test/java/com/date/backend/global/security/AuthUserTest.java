package com.date.backend.global.security;

import com.date.backend.domain.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AuthUserTest {

	@Test
	void principalNameIsStableUserId() {
		AuthUser authUser = new AuthUser(101L, "user@example.com", UserRole.USER);

		assertThat(authUser.getName()).isEqualTo("101");
	}
}
