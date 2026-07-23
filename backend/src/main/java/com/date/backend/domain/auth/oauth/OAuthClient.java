package com.date.backend.domain.auth.oauth;

import com.date.backend.domain.auth.domain.OAuthProvider;

import java.net.URI;

public interface OAuthClient {
	URI authorizationUri(OAuthProvider provider, String state);

	OAuthUserInfo authenticate(OAuthProvider provider, String code, String state);
}
