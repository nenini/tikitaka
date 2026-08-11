package com.date.backend.domain.room.dto.response;

import com.date.backend.domain.room.domain.RoomSessionStatus;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 세션 진행 상태.
 *
 * <p>{@code voiceAnalysisEnabled}·{@code expressionAnalysisEnabled} 는 세션 공용이 아니라
 * <b>요청한 사용자</b> 것이다. 상대방 동의 여부는 개인정보라 내려보내지 않는다.
 *
 * <p>참가자 행에 저장된 값을 그대로 쓴다 — AiAnalysisEventService 가 분석 이벤트를 받을 때
 * 검사하는 값과 같아야 한다. 동의 기록에서 새로 계산하면 두 값이 어긋나, 브라우저는 분석을
 * 시작했는데 서버가 AI_ANALYSIS_CONSENT_REQUIRED 로 전부 버리는 상태가 될 수 있다.
 */
public record SessionStatusResponse(
		Long sessionId,
		RoomSessionStatus status,
		LocalDateTime scheduledStartAt,
		LocalDateTime actualStartAt,
		long remainingSeconds,
		boolean allJoined,
		boolean allReady,
		boolean allConnected,
		boolean voiceAnalysisEnabled,
		boolean expressionAnalysisEnabled,
		List<SessionParticipantStateResponse> participants
) {
}
