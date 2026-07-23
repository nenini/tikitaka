package com.date.backend.domain.auth.dto.response;

import com.date.backend.domain.user.domain.AccountStatus;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.domain.UserRole;

public record UserResponse(
		Long userId,
		String email,
		String realName,
		String phoneNumber,
		AccountStatus accountStatus,
		UserRole role
) {
	public static UserResponse from(User user) {
		return new UserResponse(
				user.getId(),
				user.getEmail(),
				user.getRealName(),
				user.getPhoneNumber(),
				user.getAccountStatus(),
				user.getRole()
		);
	}
}
