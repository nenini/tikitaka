package com.date.backend.global.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {
	public static final String BEARER_AUTH = "BearerAuth";

	@Bean
	public OpenAPI backendOpenApi() {
		return new OpenAPI()
				.components(new Components()
						.addSecuritySchemes(BEARER_AUTH, new SecurityScheme()
								.type(SecurityScheme.Type.HTTP)
								.scheme("bearer")
								.bearerFormat("JWT")
								.name("Authorization")))
				.info(new Info()
						.title("DATE Backend API")
						.description("DATE 서비스 백엔드 REST API 명세서")
						.version("v1"));
	}
}
