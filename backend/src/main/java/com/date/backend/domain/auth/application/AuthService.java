package com.date.backend.domain.auth.application;

import com.date.backend.domain.auth.domain.RefreshToken;
import com.date.backend.domain.auth.dto.request.LoginRequest;
import com.date.backend.domain.auth.dto.request.SignupRequest;
import com.date.backend.domain.auth.dto.response.AuthTokenResponse;
import com.date.backend.domain.auth.dto.response.UserResponse;
import com.date.backend.domain.auth.repository.RefreshTokenRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import com.date.backend.global.security.JwtProperties;
import com.date.backend.global.security.JwtTokenProvider;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class AuthService {
	private static final int REFRESH_TOKEN_BYTES = 64;

	private final UserRepository userRepository;
	private final RefreshTokenRepository refreshTokenRepository;
	private final PasswordEncoder passwordEncoder;
	private final JwtTokenProvider jwtTokenProvider;
	private final JwtProperties jwtProperties;
	private final SecureRandom secureRandom = new SecureRandom();

	public AuthService(
			UserRepository userRepository,
			RefreshTokenRepository refreshTokenRepository,
			PasswordEncoder passwordEncoder,
			JwtTokenProvider jwtTokenProvider,
			JwtProperties jwtProperties
	) {
		this.userRepository = userRepository;
		this.refreshTokenRepository = refreshTokenRepository;
		this.passwordEncoder = passwordEncoder;
		this.jwtTokenProvider = jwtTokenProvider;
		this.jwtProperties = jwtProperties;
	}

	@Transactional
	public AuthTokenResponse signup(SignupRequest request) {
		if (userRepository.existsByEmail(request.email())) {
			throw new BusinessException(AuthErrorCode.DUPLICATE_EMAIL);
		}

		User user = new User(
				request.email(),
				passwordEncoder.encode(request.password()),
				request.realName(),
				request.phoneNumber(),
				request.birthDate()
		);
		userRepository.save(user);
		user.recordLogin();
		return issueTokens(user);
	}

	@Transactional
	public AuthTokenResponse login(LoginRequest request) {
		User user = userRepository.findByEmail(request.email())
				.orElseThrow(() -> new BusinessException(AuthErrorCode.INVALID_CREDENTIALS));

		if (user.getPasswordHash() == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
			throw new BusinessException(AuthErrorCode.INVALID_CREDENTIALS);
		}
		validateActive(user);

		user.recordLogin();
		return issueTokens(user);
	}

	@Transactional
	public AuthTokenResponse refresh(String refreshTokenValue) {
		RefreshToken refreshToken = refreshTokenRepository.findByTokenHash(hash(refreshTokenValue))
				.orElseThrow(() -> new BusinessException(AuthErrorCode.INVALID_TOKEN));

		if (!refreshToken.isUsable(LocalDateTime.now())) {
			throw new BusinessException(AuthErrorCode.INVALID_TOKEN);
		}

		User user = refreshToken.getUser();
		validateActive(user);

		refreshToken.markUsed();
		refreshToken.revoke();
		return issueTokens(user);
	}

	@Transactional
	public void logout(String refreshTokenValue) {
		refreshTokenRepository.findByTokenHash(hash(refreshTokenValue))
				.filter(token -> token.isUsable(LocalDateTime.now()))
				.ifPresent(RefreshToken::revoke);
	}

	@Transactional(readOnly = true)
	public UserResponse getMe(Long userId) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));
		validateActive(user);
		return UserResponse.from(user);
	}

	AuthTokenResponse issueTokens(User user) {
		String accessToken = jwtTokenProvider.createAccessToken(user);
		String refreshTokenValue = createRefreshTokenValue();
		LocalDateTime expiresAt = LocalDateTime.now().plusSeconds(jwtProperties.refreshTokenValiditySeconds());

		refreshTokenRepository.save(new RefreshToken(user, hash(refreshTokenValue), expiresAt));

		return new AuthTokenResponse(
				"Bearer",
				accessToken,
				jwtProperties.accessTokenValiditySeconds(),
				refreshTokenValue,
				jwtProperties.refreshTokenValiditySeconds()
		);
	}

	private void validateActive(User user) {
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
	}

	private String createRefreshTokenValue() {
		byte[] bytes = new byte[REFRESH_TOKEN_BYTES];
		secureRandom.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	private String hash(String value) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		} catch (Exception exception) {
			throw new IllegalStateException("Failed to hash refresh token", exception);
		}
	}
}
