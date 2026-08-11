package com.date.backend.domain.room.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

public record RoomDeviceCheckRequest(
		@NotNull
		@Schema(description = "카메라 점검 성공 여부", example = "true")
		Boolean cameraPassed,

		@NotNull
		@Schema(description = "마이크 점검 성공 여부", example = "true")
		Boolean microphonePassed,

		@NotNull
		@Schema(description = "스피커 점검 성공 여부", example = "true")
		Boolean speakerPassed,

		@NotNull
		@Schema(description = "네트워크 점검 성공 여부", example = "true")
		Boolean networkPassed
) {
}
