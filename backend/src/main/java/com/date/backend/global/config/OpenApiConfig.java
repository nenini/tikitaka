package com.date.backend.global.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

	@Bean
	public OpenAPI backendOpenApi() {
		return new OpenAPI()
				.info(new Info()
						.title("Backend API")
						.description("Backend REST API documentation")
						.version("v1"));
	}
}
