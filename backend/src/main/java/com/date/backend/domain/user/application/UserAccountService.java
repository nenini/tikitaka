package com.date.backend.domain.user.application;

import com.date.backend.domain.auth.repository.PasswordResetTokenRepository;
import com.date.backend.domain.auth.repository.RefreshTokenRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class UserAccountService {
	private final UserRepository userRepository;
	private final RefreshTokenRepository refreshTokenRepository;
	private final PasswordResetTokenRepository passwordResetTokenRepository;
	private final PasswordEncoder passwordEncoder;
	private final ApplicationEventPublisher eventPublisher;

	public UserAccountService(
			UserRepository userRepository,
			RefreshTokenRepository refreshTokenRepository,
			PasswordResetTokenRepository passwordResetTokenRepository,
			PasswordEncoder passwordEncoder,
			ApplicationEventPublisher eventPublisher
	) {
		this.userRepository = userRepository;
		this.refreshTokenRepository = refreshTokenRepository;
		this.passwordResetTokenRepository = passwordResetTokenRepository;
		this.passwordEncoder = passwordEncoder;
		this.eventPublisher = eventPublisher;
	}

	@Transactional
	public void withdraw(Long userId, String password) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));

		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
		if (user.getPasswordHash() == null || !passwordEncoder.matches(password, user.getPasswordHash())) {
			throw new BusinessException(AuthErrorCode.INVALID_CREDENTIALS);
		}

		LocalDateTime now = LocalDateTime.now();
		user.withdraw(now);
		refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(userId)
				.forEach(token -> token.revokeAt(now));
		passwordResetTokenRepository.findAllByUserIdAndUsedAtIsNull(userId)
				.forEach(token -> token.markUsed(now));

		eventPublisher.publishEvent(new UserWithdrawnEvent(userId, now));
	}
}
