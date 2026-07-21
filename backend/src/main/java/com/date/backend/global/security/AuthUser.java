package com.date.backend.global.security;

import com.date.backend.domain.user.domain.UserRole;

public record AuthUser(
		Long userId,
		String email,
		UserRole role
) {
}
