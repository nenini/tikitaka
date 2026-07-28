package com.date.backend.domain.aichat.integration;

import com.date.backend.domain.profile.domain.Gender;

public record AiChatPersonaCondition(
		Gender gender,
		int age
) {
}
