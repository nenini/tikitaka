package com.date.backend.global.security;

import com.date.backend.global.exception.BusinessException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
	private static final String BEARER_PREFIX = "Bearer ";

	private final JwtTokenProvider jwtTokenProvider;

	public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider) {
		this.jwtTokenProvider = jwtTokenProvider;
	}

	@Override
	protected void doFilterInternal(
			HttpServletRequest request,
			HttpServletResponse response,
			FilterChain filterChain
	) throws ServletException, IOException {
		String authorization = request.getHeader("Authorization");
		if (authorization != null && authorization.startsWith(BEARER_PREFIX)) {
			try {
				AuthUser authUser = jwtTokenProvider.parseAccessToken(authorization.substring(BEARER_PREFIX.length()));
				UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
						authUser,
						null,
						List.of(new SimpleGrantedAuthority("ROLE_" + authUser.role().name()))
				);
				SecurityContextHolder.getContext().setAuthentication(authentication);
			} catch (BusinessException exception) {
				SecurityContextHolder.clearContext();
				request.setAttribute("auth.exception", exception);
			}
		}

		filterChain.doFilter(request, response);
	}
}
