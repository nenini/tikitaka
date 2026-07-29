package com.date.backend.domain.room.api;

import com.date.backend.domain.room.application.SessionRealtimeConnectionService;
import com.date.backend.domain.room.dto.request.SessionConnectionStateRequest;
import com.date.backend.domain.room.dto.request.SessionHeartbeatRequest;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class SessionRealtimeController {
	private final SessionRealtimeConnectionService connectionService;

	public SessionRealtimeController(
			SessionRealtimeConnectionService connectionService
	) {
		this.connectionService = connectionService;
	}

	@MessageMapping("/sessions/{sessionId}/heartbeat")
	public void heartbeat(
			Principal principal,
			@DestinationVariable Long sessionId,
			@Valid @Payload SessionHeartbeatRequest request
	) {
		connectionService.heartbeat(
				currentUserId(principal),
				sessionId,
				request
		);
	}

	@MessageMapping("/sessions/{sessionId}/connection-state")
	public void updateConnectionState(
			Principal principal,
			@DestinationVariable Long sessionId,
			@Valid @Payload SessionConnectionStateRequest request
	) {
		connectionService.updateConnectionState(
				currentUserId(principal),
				sessionId,
				request
		);
	}

	private Long currentUserId(Principal principal) {
		if (principal
				instanceof UsernamePasswordAuthenticationToken authentication
				&& authentication.getPrincipal() instanceof AuthUser authUser) {
			return authUser.userId();
		}
		throw new BusinessException(AuthErrorCode.UNAUTHORIZED);
	}
}
