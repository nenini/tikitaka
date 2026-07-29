package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.RoomDeviceCheck;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDateTime;

public record RoomDeviceCheckResponse(
		@Schema(description = "기기 점검 결과 ID", example = "31")
		Long deviceCheckId,

		@Schema(description = "대기방 ID", example = "15")
		Long roomId,

		@Schema(description = "점검 사용자 ID", example = "1")
		Long userId,

		boolean cameraPassed,
		boolean microphonePassed,
		boolean speakerPassed,
		boolean networkPassed,

		@Schema(description = "준비 완료 처리 가능 여부", example = "true")
		boolean readyAvailable,

		@Schema(description = "서버가 기록한 점검 시각")
		LocalDateTime checkedAt
) {
	public static RoomDeviceCheckResponse from(Long roomId, RoomDeviceCheck check) {
		return new RoomDeviceCheckResponse(
				check.getId(),
				roomId,
				check.getUserId(),
				check.isCameraPassed(),
				check.isMicrophonePassed(),
				check.isSpeakerPassed(),
				check.isNetworkPassed(),
				check.isReadyAvailable(),
				check.getCheckedAt()
		);
	}
}
