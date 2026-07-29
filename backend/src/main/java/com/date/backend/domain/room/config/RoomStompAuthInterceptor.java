package com.date.backend.domain.room.config;

import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.RoomErrorCode;
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
		Matcher matcher = PARTICIPANT_TOPIC.matcher(destination);
		if (!matcher.matches()) {
			throw new BusinessException(RoomErrorCode.ROOM_NOT_PARTICIPANT);
		}
		if (accessor.getUser() == null
				|| !(accessor.getUser() instanceof UsernamePasswordAuthenticationToken authentication)
				|| !(authentication.getPrincipal() instanceof AuthUser authUser)) {
			throw new BusinessException(AuthErrorCode.UNAUTHORIZED);
		}
		Long roomId = Long.parseLong(matcher.group(1));
		if (!participantRepository.existsByRoom_IdAndUserId(roomId, authUser.userId())) {
			throw new BusinessException(RoomErrorCode.ROOM_NOT_PARTICIPANT);
		}
	}
}
