package com.date.backend.global.security;

import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
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
	private final UserRepository userRepository;

	public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider, UserRepository userRepository) {
		this.jwtTokenProvider = jwtTokenProvider;
		this.userRepository = userRepository;
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
				AuthUser tokenUser = jwtTokenProvider.parseAccessToken(authorization.substring(BEARER_PREFIX.length()));
				User user = userRepository.findById(tokenUser.userId())
						.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));
				if (!user.isActive()) {
					throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
				}
				AuthUser authUser = new AuthUser(user.getId(), user.getEmail(), user.getRole());
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
