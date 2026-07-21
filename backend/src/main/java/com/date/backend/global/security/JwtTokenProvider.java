package com.date.backend.global.security;

import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.ErrorCode;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class JwtTokenProvider {
	private static final String HMAC_ALGORITHM = "HmacSHA256";
	private static final Base64.Encoder BASE64_URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
	private static final Base64.Decoder BASE64_URL_DECODER = Base64.getUrlDecoder();
	private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
	};

	private final JwtProperties properties;
	private final ObjectMapper objectMapper;

	public JwtTokenProvider(JwtProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
	}

	public String createAccessToken(User user) {
		Instant now = Instant.now();
		Instant expiresAt = now.plusSeconds(properties.accessTokenValiditySeconds());

		Map<String, Object> claims = new LinkedHashMap<>();
		claims.put("sub", String.valueOf(user.getId()));
		claims.put("email", user.getEmail());
		claims.put("role", user.getRole().name());
		claims.put("typ", "access");
		claims.put("iat", now.getEpochSecond());
		claims.put("exp", expiresAt.getEpochSecond());

		return sign(claims);
	}

	public AuthUser parseAccessToken(String token) {
		Map<String, Object> claims = parseClaims(token);
		if (!"access".equals(claims.get("typ"))) {
			throw new BusinessException(ErrorCode.INVALID_TOKEN);
		}

		long expiresAt = asLong(claims.get("exp"));
		if (Instant.now().getEpochSecond() >= expiresAt) {
			throw new BusinessException(ErrorCode.INVALID_TOKEN, "만료된 토큰입니다.");
		}

		return new AuthUser(
				Long.parseLong(String.valueOf(claims.get("sub"))),
				String.valueOf(claims.get("email")),
				UserRole.valueOf(String.valueOf(claims.get("role")))
		);
	}

	private String sign(Map<String, Object> claims) {
		try {
			Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
			String encodedHeader = encodeJson(header);
			String encodedPayload = encodeJson(claims);
			String signingInput = encodedHeader + "." + encodedPayload;
			String signature = BASE64_URL_ENCODER.encodeToString(hmac(signingInput.getBytes(StandardCharsets.UTF_8)));
			return signingInput + "." + signature;
		} catch (Exception exception) {
			throw new IllegalStateException("Failed to create JWT", exception);
		}
	}

	private Map<String, Object> parseClaims(String token) {
		try {
			String[] parts = token.split("\\.");
			if (parts.length != 3) {
				throw new BusinessException(ErrorCode.INVALID_TOKEN);
			}

			String signingInput = parts[0] + "." + parts[1];
			byte[] expected = hmac(signingInput.getBytes(StandardCharsets.UTF_8));
			byte[] actual = BASE64_URL_DECODER.decode(parts[2]);
			if (!MessageDigest.isEqual(expected, actual)) {
				throw new BusinessException(ErrorCode.INVALID_TOKEN);
			}

			return objectMapper.readValue(BASE64_URL_DECODER.decode(parts[1]), MAP_TYPE);
		} catch (BusinessException exception) {
			throw exception;
		} catch (Exception exception) {
			throw new BusinessException(ErrorCode.INVALID_TOKEN);
		}
	}

	private String encodeJson(Object value) throws Exception {
		return BASE64_URL_ENCODER.encodeToString(objectMapper.writeValueAsBytes(value));
	}

	private byte[] hmac(byte[] value) throws Exception {
		Mac mac = Mac.getInstance(HMAC_ALGORITHM);
		mac.init(new SecretKeySpec(properties.secret().getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
		return mac.doFinal(value);
	}

	private long asLong(Object value) {
		if (value instanceof Number number) {
			return number.longValue();
		}
		return Long.parseLong(String.valueOf(value));
	}
}
