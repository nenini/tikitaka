package com.date.backend.global.config;

import com.date.backend.global.security.JwtAccessDeniedHandler;
import com.date.backend.global.security.JwtAuthenticationEntryPoint;
import com.date.backend.global.security.JwtAuthenticationFilter;
import com.date.backend.global.security.JwtProperties;
import com.date.backend.domain.auth.password.PasswordResetProperties;
import com.date.backend.domain.auth.oauth.OAuthProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableConfigurationProperties({JwtProperties.class, PasswordResetProperties.class, OAuthProperties.class})
public class SecurityConfig {
	private static final String[] PUBLIC_ENDPOINTS = {
			"/api/v1/auth/signup",
			"/api/v1/auth/login",
			"/api/v1/auth/refresh",
			"/api/v1/auth/password/reset-request",
			"/api/v1/auth/password/reset",
			"/api/v1/auth/oauth2/**",
			"/api/v1/consents",
			"/actuator/health/**",
			"/v3/api-docs/**",
			"/swagger-ui.html",
			"/swagger-ui/**"
	};

	@Bean
	public SecurityFilterChain securityFilterChain(
			HttpSecurity http,
			JwtAuthenticationFilter jwtAuthenticationFilter,
			JwtAuthenticationEntryPoint authenticationEntryPoint,
			JwtAccessDeniedHandler accessDeniedHandler
	) throws Exception {
		http
				.csrf(AbstractHttpConfigurer::disable)
				.formLogin(AbstractHttpConfigurer::disable)
				.httpBasic(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.exceptionHandling(exceptions -> exceptions
						.authenticationEntryPoint(authenticationEntryPoint)
						.accessDeniedHandler(accessDeniedHandler)
				)
				.authorizeHttpRequests(authorize -> authorize
						.requestMatchers(PUBLIC_ENDPOINTS).permitAll() //나중에 변결 해야할듯?
						.requestMatchers(
								"/api/v1/auth/logout",
								"/api/v1/auth/account"
						).authenticated()
						.requestMatchers(
								"/api/v1/face-analyses",
								"/api/v1/face-analyses/**"
						).authenticated()
						.requestMatchers("/api/v1/surveys/**").authenticated()
						.requestMatchers("/api/v1/ai-chat/**").authenticated()
						.requestMatchers("/api/v1/match-requests/**").authenticated()
						.requestMatchers("/api/v1/matches/**").authenticated()
						.requestMatchers("/api/v1/users/**").authenticated()
						.anyRequest().permitAll()
				)
				.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

		return http.build();
	}

	@Bean
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}
}
