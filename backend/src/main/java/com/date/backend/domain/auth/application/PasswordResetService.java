package com.date.backend.domain.auth.application;

import com.date.backend.domain.auth.domain.PasswordResetToken;
import com.date.backend.domain.auth.password.PasswordResetMailSender;
import com.date.backend.domain.auth.password.PasswordResetProperties;
import com.date.backend.domain.auth.repository.PasswordResetTokenRepository;
import com.date.backend.domain.auth.repository.RefreshTokenRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
public class PasswordResetService {
	private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
	private static final int TOKEN_BYTES = 64;

	private final UserRepository userRepository;
	private final PasswordResetTokenRepository passwordResetTokenRepository;
	private final RefreshTokenRepository refreshTokenRepository;
	private final PasswordEncoder passwordEncoder;
	private final PasswordResetMailSender mailSender;
	private final PasswordResetProperties properties;
	private final SecureRandom secureRandom = new SecureRandom();

	public PasswordResetService(
			UserRepository userRepository,
			PasswordResetTokenRepository passwordResetTokenRepository,
			RefreshTokenRepository refreshTokenRepository,
			PasswordEncoder passwordEncoder,
			PasswordResetMailSender mailSender,
			PasswordResetProperties properties
	) {
		this.userRepository = userRepository;
		this.passwordResetTokenRepository = passwordResetTokenRepository;
		this.refreshTokenRepository = refreshTokenRepository;
		this.passwordEncoder = passwordEncoder;
		this.mailSender = mailSender;
		this.properties = properties;
	}

	@Transactional
	public void request(String email) {
		userRepository.findByEmail(email).ifPresent(this::issueResetToken);
	}

	@Transactional
	public void reset(String rawToken, String newPassword) {
		LocalDateTime now = LocalDateTime.now();
		PasswordResetToken resetToken = passwordResetTokenRepository.findByTokenHash(hash(rawToken))
				.orElseThrow(() -> new BusinessException(ErrorCode.INVALID_PASSWORD_RESET_TOKEN));

		if (!resetToken.isUsable(now)) {
			throw new BusinessException(ErrorCode.INVALID_PASSWORD_RESET_TOKEN);
		}

		User user = resetToken.getUser();
		if (!user.isActive()) {
			throw new BusinessException(ErrorCode.INVALID_PASSWORD_RESET_TOKEN);
		}

		user.changePassword(passwordEncoder.encode(newPassword));
		resetToken.markUsed(now);
		refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(user.getId())
				.forEach(token -> token.revokeAt(now));
	}

	private void issueResetToken(User user) {
		LocalDateTime now = LocalDateTime.now();
		passwordResetTokenRepository.findAllByUserIdAndUsedAtIsNull(user.getId())
				.forEach(token -> token.markUsed(now));

		String rawToken = createToken();
		LocalDateTime expiresAt = now.plusSeconds(properties.tokenValiditySeconds());
		passwordResetTokenRepository.save(new PasswordResetToken(user, hash(rawToken), expiresAt));

		try {
			mailSender.send(user.getEmail(), rawToken);
		} catch (RuntimeException exception) {
			log.error("Failed to send password reset email", exception);
		}
	}

	private String createToken() {
		byte[] bytes = new byte[TOKEN_BYTES];
		secureRandom.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	private String hash(String value) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
					.digest(value.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		} catch (Exception exception) {
			throw new IllegalStateException("Failed to hash password reset token", exception);
		}
	}
}
