package com.date.backend.domain.room.config;

import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import com.date.backend.global.security.AuthUser;
import com.date.backend.global.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RoomStompAuthInterceptorTest {
	private RoomParticipantRepository participantRepository;
	private RoomStompAuthInterceptor interceptor;

	@BeforeEach
	void setUp() {
		participantRepository = mock(RoomParticipantRepository.class);
		interceptor = new RoomStompAuthInterceptor(
				mock(JwtTokenProvider.class),
				mock(UserRepository.class),
				participantRepository
		);
	}

	@Test
	void sessionParticipantCanSubscribeToConnectionStateTopic() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> message = message(
				StompCommand.SUBSCRIBE,
				"/topic/sessions/15/participants"
		);

		assertThat(interceptor.preSend(message, null)).isSameAs(message);
	}

	@Test
	void sessionParticipantCanSendHeartbeat() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> message = message(
				StompCommand.SEND,
				"/app/sessions/15/heartbeat"
		);

		assertThat(interceptor.preSend(message, null)).isSameAs(message);
	}

	@Test
	void sessionParticipantCanSendMediaAndNetworkState() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> mediaMessage = message(
				StompCommand.SEND,
				"/app/sessions/15/media-state"
		);
		Message<?> networkMessage = message(
				StompCommand.SEND,
				"/app/sessions/15/network-quality"
		);

		assertThat(interceptor.preSend(mediaMessage, null))
				.isSameAs(mediaMessage);
		assertThat(interceptor.preSend(networkMessage, null))
				.isSameAs(networkMessage);
	}

	@Test
	void nonParticipantCannotSendSessionCommand() {
		Message<?> message = message(
				StompCommand.SEND,
				"/app/sessions/15/connection-state"
		);

		assertThatThrownBy(() -> interceptor.preSend(message, null))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode.SESSION_NOT_PARTICIPANT
						)
				);
	}

	private Message<?> message(StompCommand command, String destination) {
		StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
		accessor.setDestination(destination);
		AuthUser authUser = new AuthUser(
				101L,
				"user@example.com",
				UserRole.USER
		);
		accessor.setUser(new UsernamePasswordAuthenticationToken(
				authUser,
				null,
				List.of()
		));
		return MessageBuilder.createMessage(
				new byte[0],
				accessor.getMessageHeaders()
		);
	}
}
