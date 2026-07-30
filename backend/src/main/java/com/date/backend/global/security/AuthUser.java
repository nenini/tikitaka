package com.date.backend.global.security;

import com.date.backend.domain.user.domain.UserRole;

import java.security.Principal;

public record AuthUser(
		Long userId,
		String email,
		UserRole role
) implements Principal {
	@Override
	public String getName() {
		return String.valueOf(userId);
	}
}
