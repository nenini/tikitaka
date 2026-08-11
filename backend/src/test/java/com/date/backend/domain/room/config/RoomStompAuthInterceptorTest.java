package com.date.backend.domain.room.config;

import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.user.domain.User;
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
	void connectStoresAuthenticatedUserOnOriginalStompMessage() {
		JwtTokenProvider tokenProvider = mock(JwtTokenProvider.class);
		UserRepository userRepository = mock(UserRepository.class);
		RoomStompAuthInterceptor connectInterceptor = new RoomStompAuthInterceptor(
				tokenProvider,
				userRepository,
				participantRepository
		);
		AuthUser tokenUser = new AuthUser(101L, "session@example.com", UserRole.USER);
		User user = mock(User.class);
		when(tokenProvider.parseAccessToken("access-token")).thenReturn(tokenUser);
		when(userRepository.findById(101L)).thenReturn(java.util.Optional.of(user));
		when(user.isActive()).thenReturn(true);
		when(user.getId()).thenReturn(101L);
		when(user.getEmail()).thenReturn("session@example.com");
		when(user.getRole()).thenReturn(UserRole.USER);

		StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
		accessor.setNativeHeader("Authorization", "Bearer access-token");
		accessor.setLeaveMutable(true);
		Message<?> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

		connectInterceptor.preSend(message, null);

		StompHeaderAccessor stored = StompHeaderAccessor.wrap(message);
		assertThat(stored.getUser()).isInstanceOf(UsernamePasswordAuthenticationToken.class);
		assertThat(stored.getUser().getName()).isEqualTo("101");
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
	void sessionParticipantCanSubscribeToTimerTopic() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> message = message(
				StompCommand.SUBSCRIBE,
				"/topic/sessions/15/timer"
		);

		assertThat(interceptor.preSend(message, null)).isSameAs(message);
	}

	@Test
	void sessionParticipantCanSubscribeToLifecycleTopic() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> message = message(
				StompCommand.SUBSCRIBE,
				"/topic/sessions/15/lifecycle"
		);

		assertThat(interceptor.preSend(message, null)).isSameAs(message);
	}

	@Test
	void sessionParticipantCanSubscribeToExtensionDecisionTopic() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> message = message(
				StompCommand.SUBSCRIBE,
				"/topic/sessions/15/extensions"
		);

		assertThat(interceptor.preSend(message, null)).isSameAs(message);
	}

	@Test
	void sessionParticipantCanSubscribeToOwnCoachingQueue() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> message = message(
				StompCommand.SUBSCRIBE,
				"/user/queue/sessions/15/coaching"
		);

		assertThat(interceptor.preSend(message, null)).isSameAs(message);
	}

	@Test
	void sessionParticipantCanSubscribeToSilenceAndQuestionDestinations() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> silenceMessage = message(
				StompCommand.SUBSCRIBE,
				"/topic/sessions/15/silence"
		);
		Message<?> questionMessage = message(
				StompCommand.SUBSCRIBE,
				"/user/queue/sessions/15/questions"
		);

		assertThat(interceptor.preSend(silenceMessage, null))
				.isSameAs(silenceMessage);
		assertThat(interceptor.preSend(questionMessage, null))
				.isSameAs(questionMessage);
	}

	@Test
	void sessionParticipantCanSubscribeToOwnSafetyQueue() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 101L))
				.thenReturn(true);
		Message<?> message = message(
				StompCommand.SUBSCRIBE,
				"/user/queue/sessions/15/safety"
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
