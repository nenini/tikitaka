package com.date.backend.domain.room.dto.request;

import com.date.backend.domain.room.domain.SessionTerminationReason;
import jakarta.validation.constraints.NotNull;

public record SessionTerminateRequest(
		@NotNull(message = "조기 종료 사유는 필수입니다.")
		Reason reason
) {
	public enum Reason {
		USER_REQUEST,
		SAFETY_CONCERN,
		TECHNICAL_ISSUE,
		OTHER;

		public SessionTerminationReason toDomain() {
			return SessionTerminationReason.valueOf(name());
		}
	}
}
