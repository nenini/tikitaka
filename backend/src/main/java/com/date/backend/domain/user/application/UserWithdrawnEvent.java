package com.date.backend.domain.user.application;

import java.time.LocalDateTime;

public record UserWithdrawnEvent(
		Long userId,
		LocalDateTime withdrawnAt
) {
}
