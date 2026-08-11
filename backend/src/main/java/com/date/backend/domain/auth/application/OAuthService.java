package com.date.backend.domain.auth.application;

import com.date.backend.domain.auth.domain.OAuthAccount;
import com.date.backend.domain.auth.domain.OAuthProvider;
import com.date.backend.domain.auth.dto.response.AuthTokenResponse;
import com.date.backend.domain.auth.oauth.OAuthClient;
import com.date.backend.domain.auth.oauth.OAuthUserInfo;
import com.date.backend.domain.auth.repository.OAuthAccountRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.UserErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;

@Service
public class OAuthService {
	private final OAuthClient oauthClient;
	private final OAuthAccountRepository oauthAccountRepository;
	private final UserRepository userRepository;
	private final AuthService authService;

	public OAuthService(
			OAuthClient oauthClient,
			OAuthAccountRepository oauthAccountRepository,
			UserRepository userRepository,
			AuthService authService
	) {
		this.oauthClient = oauthClient;
		this.oauthAccountRepository = oauthAccountRepository;
		this.userRepository = userRepository;
		this.authService = authService;
	}

	public URI authorizationUri(OAuthProvider provider, String state) {
		return oauthClient.authorizationUri(provider, state);
	}

	@Transactional
	public AuthTokenResponse login(OAuthProvider provider, String code, String state) {
		OAuthUserInfo userInfo = oauthClient.authenticate(provider, code, state);
		User user = oauthAccountRepository
				.findByProviderAndProviderUserId(provider, userInfo.providerUserId())
				.map(OAuthAccount::getUser)
				.orElseGet(() -> linkOrCreate(provider, userInfo));

		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
		user.recordLogin();
		return authService.issueTokens(user);
	}

	private User linkOrCreate(OAuthProvider provider, OAuthUserInfo userInfo) {
		User user = userRepository.findByEmail(userInfo.email())
				.orElseGet(() -> userRepository.save(
						User.oauthUser(userInfo.email(), userInfo.name())));
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
		oauthAccountRepository.save(new OAuthAccount(user, provider, userInfo.providerUserId()));
		return user;
	}
}
