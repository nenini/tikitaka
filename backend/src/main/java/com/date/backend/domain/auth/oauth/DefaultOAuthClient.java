package com.date.backend.domain.auth.oauth;

import com.date.backend.domain.auth.domain.OAuthProvider;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Locale;

@Component
public class DefaultOAuthClient implements OAuthClient {
	private static final Logger log = LoggerFactory.getLogger(DefaultOAuthClient.class);
	private static final String GOOGLE_AUTHORIZATION_URI = "https://accounts.google.com/o/oauth2/v2/auth";
	private static final String GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
	private static final String GOOGLE_USERINFO_URI = "https://openidconnect.googleapis.com/v1/userinfo";
	private static final String NAVER_AUTHORIZATION_URI = "https://nid.naver.com/oauth2.0/authorize";
	private static final String NAVER_TOKEN_URI = "https://nid.naver.com/oauth2.0/token";
	private static final String NAVER_USERINFO_URI = "https://openapi.naver.com/v1/nid/me";

	private final OAuthProperties properties;
	private final ObjectMapper objectMapper;
	private final RestClient restClient = RestClient.create();

	public DefaultOAuthClient(OAuthProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
	}

	@Override
	public URI authorizationUri(OAuthProvider provider, String state) {
		OAuthProperties.Provider config = configured(provider);
		UriComponentsBuilder builder = UriComponentsBuilder
				.fromUriString(provider == OAuthProvider.GOOGLE ? GOOGLE_AUTHORIZATION_URI : NAVER_AUTHORIZATION_URI)
				.queryParam("client_id", config.clientId())
				.queryParam("redirect_uri", config.redirectUri())
				.queryParam("response_type", "code")
				.queryParam("state", state);

		if (provider == OAuthProvider.GOOGLE) {
			builder.queryParam("scope", "openid email profile")
					.queryParam("prompt", "select_account");
		}
		return builder.build().encode().toUri();
	}

	@Override
	public OAuthUserInfo authenticate(OAuthProvider provider, String code, String state) {
		try {
			OAuthProperties.Provider config = configured(provider);
			String accessToken = exchangeToken(provider, config, code, state);
			return provider == OAuthProvider.GOOGLE
					? googleUserInfo(accessToken)
					: naverUserInfo(accessToken);
		} catch (BusinessException exception) {
			throw exception;
		} catch (RuntimeException exception) {
			log.warn("OAuth authentication failed unexpectedly. provider={}, exception={}, message={}",
					provider, exception.getClass().getSimpleName(), exception.getMessage());
			throw new BusinessException(ErrorCode.OAUTH_AUTHENTICATION_FAILED);
		}
	}

	private String exchangeToken(
			OAuthProvider provider,
			OAuthProperties.Provider config,
			String code,
			String state
	) {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("grant_type", "authorization_code");
		form.add("client_id", config.clientId());
		form.add("client_secret", config.clientSecret());
		form.add("code", code);
		form.add("redirect_uri", config.redirectUri());
		if (provider == OAuthProvider.NAVER) {
			form.add("state", state);
		}

		JsonNode response;
		try {
			String responseBody = restClient.post()
					.uri(provider == OAuthProvider.GOOGLE ? GOOGLE_TOKEN_URI : NAVER_TOKEN_URI)
					.contentType(MediaType.APPLICATION_FORM_URLENCODED)
					.body(form)
					.retrieve()
					.body(String.class);
			response = parseJson(responseBody);
		} catch (RestClientResponseException exception) {
			logProviderFailure(provider, "token_exchange", exception);
			throw new BusinessException(ErrorCode.OAUTH_AUTHENTICATION_FAILED);
		}
		String accessToken = text(response, "access_token");
		if (accessToken == null) {
			throw new BusinessException(ErrorCode.OAUTH_AUTHENTICATION_FAILED);
		}
		return accessToken;
	}

	private OAuthUserInfo googleUserInfo(String accessToken) {
		JsonNode response = userInfo(OAuthProvider.GOOGLE, GOOGLE_USERINFO_URI, accessToken);
		if (!response.path("email_verified").asBoolean(false)) {
			throw new BusinessException(ErrorCode.OAUTH_AUTHENTICATION_FAILED);
		}
		return requiredUserInfo(response, "sub");
	}

	private OAuthUserInfo naverUserInfo(String accessToken) {
		JsonNode root = userInfo(OAuthProvider.NAVER, NAVER_USERINFO_URI, accessToken);
		if (!"00".equals(root.path("resultcode").asText())) {
			throw new BusinessException(ErrorCode.OAUTH_AUTHENTICATION_FAILED);
		}
		return requiredUserInfo(root.path("response"), "id");
	}

	private JsonNode userInfo(OAuthProvider provider, String uri, String accessToken) {
		try {
			String responseBody = restClient.get()
					.uri(uri)
					.headers(headers -> headers.setBearerAuth(accessToken))
					.retrieve()
					.body(String.class);
			return parseJson(responseBody);
		} catch (RestClientResponseException exception) {
			logProviderFailure(provider, "user_info", exception);
			throw new BusinessException(ErrorCode.OAUTH_AUTHENTICATION_FAILED);
		}
	}

	private JsonNode parseJson(String responseBody) {
		try {
			return objectMapper.readTree(responseBody);
		} catch (Exception exception) {
			log.warn("OAuth provider returned an unreadable JSON response.");
			throw new BusinessException(ErrorCode.OAUTH_AUTHENTICATION_FAILED);
		}
	}

	private void logProviderFailure(
			OAuthProvider provider,
			String stage,
			RestClientResponseException exception
	) {
		String body = exception.getResponseBodyAsString()
				.replaceAll("[\\r\\n]", " ");
		if (body.length() > 500) {
			body = body.substring(0, 500);
		}
		log.warn("OAuth provider request failed. provider={}, stage={}, status={}, response={}",
				provider, stage, exception.getStatusCode().value(), body);
	}

	private OAuthUserInfo requiredUserInfo(JsonNode response, String idField) {
		String id = text(response, idField);
		String email = text(response, "email");
		String name = text(response, "name");
		if (id == null || email == null || !email.contains("@")) {
			throw new BusinessException(ErrorCode.OAUTH_AUTHENTICATION_FAILED);
		}
		email = email.trim().toLowerCase(Locale.ROOT);
		if (name == null) {
			name = email.substring(0, email.indexOf('@'));
		}
		return new OAuthUserInfo(id, email, name);
	}

	private OAuthProperties.Provider configured(OAuthProvider provider) {
		OAuthProperties.Provider config = properties.get(provider);
		if (config == null || !config.isConfigured()) {
			throw new BusinessException(ErrorCode.OAUTH_NOT_CONFIGURED);
		}
		return config;
	}

	private String text(JsonNode node, String field) {
		if (node == null || node.path(field).isMissingNode() || node.path(field).isNull()) {
			return null;
		}
		String value = node.path(field).asText();
		return value.isBlank() ? null : value;
	}
}
