package com.date.backend.global.security;

import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {
	private final SecurityErrorWriter errorWriter;

	public JwtAuthenticationEntryPoint(SecurityErrorWriter errorWriter) {
		this.errorWriter = errorWriter;
	}

	@Override
	public void commence(
			HttpServletRequest request,
			HttpServletResponse response,
			AuthenticationException authException
	) throws IOException {
		Object exception = request.getAttribute("auth.exception");
		ErrorCode errorCode = exception instanceof BusinessException businessException
				? businessException.getErrorCode()
				: ErrorCode.UNAUTHORIZED;
		errorWriter.write(request, response, errorCode);
	}
}
