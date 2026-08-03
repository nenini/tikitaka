package com.date.backend.domain.room.config;

import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.RoomErrorCode;
import com.date.backend.global.exception.code.SessionErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import com.date.backend.global.security.AuthUser;
import com.date.backend.global.security.JwtTokenProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class RoomStompAuthInterceptor implements ChannelInterceptor {
	private static final String BEARER_PREFIX = "Bearer ";
	private static final Pattern PARTICIPANT_TOPIC = Pattern.compile(
			"^/topic/rooms/(\\d+)/participants$"
	);
	private static final Pattern SESSION_PARTICIPANT_TOPIC = Pattern.compile(
			"^/topic/sessions/(\\d+)/participants$"
	);
	private static final Pattern SESSION_TIMER_TOPIC = Pattern.compile(
			"^/topic/sessions/(\\d+)/timer$"
	);
	private static final Pattern SESSION_LIFECYCLE_TOPIC = Pattern.compile(
			"^/topic/sessions/(\\d+)/lifecycle$"
	);
	private static final Pattern SESSION_EXTENSION_TOPIC = Pattern.compile(
			"^/topic/sessions/(\\d+)/extensions$"
	);
	private static final Pattern SESSION_COACHING_QUEUE = Pattern.compile(
			"^/user/queue/sessions/(\\d+)/coaching$"
	);
	private static final Pattern SESSION_SILENCE_TOPIC = Pattern.compile(
			"^/topic/sessions/(\\d+)/silence$"
	);
	private static final Pattern SESSION_QUESTION_QUEUE = Pattern.compile(
			"^/user/queue/sessions/(\\d+)/questions$"
	);
	private static final Pattern SESSION_SAFETY_QUEUE = Pattern.compile(
			"^/user/queue/sessions/(\\d+)/safety$"
	);
	private static final Pattern SESSION_COMMAND = Pattern.compile(
			"^/app/sessions/(\\d+)/(heartbeat|connection-state|"
					+ "media-state|network-quality)$"
	);

	private final JwtTokenProvider jwtTokenProvider;
	private final UserRepository userRepository;
	private final RoomParticipantRepository participantRepository;

	public RoomStompAuthInterceptor(
			JwtTokenProvider jwtTokenProvider,
			UserRepository userRepository,
			RoomParticipantRepository participantRepository
	) {
		this.jwtTokenProvider = jwtTokenProvider;
		this.userRepository = userRepository;
		this.participantRepository = participantRepository;
	}

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
		if (StompCommand.CONNECT.equals(accessor.getCommand())) {
			authenticate(accessor);
		}
		if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
			authorizeSubscription(accessor);
		}
		if (StompCommand.SEND.equals(accessor.getCommand())) {
			authorizeSend(accessor);
		}
		return message;
	}

	private void authenticate(StompHeaderAccessor accessor) {
		String authorization = accessor.getFirstNativeHeader("Authorization");
		if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
			throw new BusinessException(AuthErrorCode.UNAUTHORIZED);
		}
		AuthUser tokenUser = jwtTokenProvider.parseAccessToken(
				authorization.substring(BEARER_PREFIX.length())
		);
		User user = userRepository.findById(tokenUser.userId())
				.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
		AuthUser authUser = new AuthUser(user.getId(), user.getEmail(), user.getRole());
		accessor.setUser(new UsernamePasswordAuthenticationToken(
				authUser,
				null,
				List.of(new SimpleGrantedAuthority("ROLE_" + authUser.role().name()))
		));
	}

	private void authorizeSubscription(StompHeaderAccessor accessor) {
		String destination = accessor.getDestination();
		if (destination == null) {
			return;
		}
		Matcher roomMatcher = PARTICIPANT_TOPIC.matcher(destination);
		if (roomMatcher.matches()) {
			assertRoomParticipant(
					Long.parseLong(roomMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		Matcher sessionMatcher = SESSION_PARTICIPANT_TOPIC.matcher(destination);
		if (sessionMatcher.matches()) {
			assertSessionParticipant(
					Long.parseLong(sessionMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		Matcher timerMatcher = SESSION_TIMER_TOPIC.matcher(destination);
		if (timerMatcher.matches()) {
			assertSessionParticipant(
					Long.parseLong(timerMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		Matcher lifecycleMatcher =
				SESSION_LIFECYCLE_TOPIC.matcher(destination);
		if (lifecycleMatcher.matches()) {
			assertSessionParticipant(
					Long.parseLong(lifecycleMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		Matcher extensionMatcher =
				SESSION_EXTENSION_TOPIC.matcher(destination);
		if (extensionMatcher.matches()) {
			assertSessionParticipant(
					Long.parseLong(extensionMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		Matcher coachingMatcher = SESSION_COACHING_QUEUE.matcher(destination);
		if (coachingMatcher.matches()) {
			assertSessionParticipant(
					Long.parseLong(coachingMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		Matcher silenceMatcher = SESSION_SILENCE_TOPIC.matcher(destination);
		if (silenceMatcher.matches()) {
			assertSessionParticipant(
					Long.parseLong(silenceMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		Matcher questionMatcher = SESSION_QUESTION_QUEUE.matcher(destination);
		if (questionMatcher.matches()) {
			assertSessionParticipant(
					Long.parseLong(questionMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		Matcher safetyMatcher = SESSION_SAFETY_QUEUE.matcher(destination);
		if (safetyMatcher.matches()) {
			assertSessionParticipant(
					Long.parseLong(safetyMatcher.group(1)),
					authUser(accessor).userId()
			);
			return;
		}

		throw new BusinessException(RoomErrorCode.ROOM_NOT_PARTICIPANT);
	}

	private void authorizeSend(StompHeaderAccessor accessor) {
		String destination = accessor.getDestination();
		if (destination == null) {
			return;
		}
		Matcher matcher = SESSION_COMMAND.matcher(destination);
		if (!matcher.matches()) {
			throw new BusinessException(
					SessionErrorCode.SESSION_NOT_PARTICIPANT
			);
		}
		assertSessionParticipant(
				Long.parseLong(matcher.group(1)),
				authUser(accessor).userId()
		);
	}

	private AuthUser authUser(StompHeaderAccessor accessor) {
		if (accessor.getUser()
				instanceof UsernamePasswordAuthenticationToken authentication
				&& authentication.getPrincipal() instanceof AuthUser authUser) {
			return authUser;
		}
		throw new BusinessException(AuthErrorCode.UNAUTHORIZED);
	}

	private void assertRoomParticipant(Long roomId, Long userId) {
		if (!participantRepository.existsByRoom_IdAndUserId(roomId, userId)) {
			throw new BusinessException(RoomErrorCode.ROOM_NOT_PARTICIPANT);
		}
	}

	private void assertSessionParticipant(Long sessionId, Long userId) {
		if (!participantRepository.existsByRoom_IdAndUserId(sessionId, userId)) {
			throw new BusinessException(
					SessionErrorCode.SESSION_NOT_PARTICIPANT
			);
		}
	}
}
