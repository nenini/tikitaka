package com.date.backend.domain.report.integration;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;

public class HttpAiReportGenerationClient implements AiReportGenerationClient {
	private final AiReportGenerationProperties properties;
	private final ObjectMapper objectMapper;
	private final HttpClient httpClient;
	private final URI uri;

	public HttpAiReportGenerationClient(AiReportGenerationProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder()
				.connectTimeout(properties.connectTimeout())
				.version(HttpClient.Version.HTTP_1_1)
				.build();
		this.uri = URI.create(properties.generationUrl());
	}

	@Override public boolean configured() { return true; }

	@Override
	public void request(AiReportGenerationRequest request) {
		HttpRequest httpRequest = HttpRequest.newBuilder(uri)
				.timeout(properties.requestTimeout())
				.header("Accept", "application/json")
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(serialize(request), StandardCharsets.UTF_8))
				.build();
		try {
			HttpResponse<String> response = httpClient.send(httpRequest,
					HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
			int status = response.statusCode();
			if ((status >= 200 && status < 300) || status == 409) return;
			throw new AiReportGenerationException(
					"AI report generation request failed. status=" + status,
					status == 408 || status == 429 || status >= 500);
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new AiReportGenerationException("AI report request interrupted.", exception, false);
		} catch (IOException exception) {
			throw new AiReportGenerationException("AI report request failed.", exception, true);
		}
	}

	private String serialize(AiReportGenerationRequest request) {
		try { return objectMapper.writeValueAsString(request); }
		catch (JsonProcessingException exception) {
			throw new AiReportGenerationException("AI report request serialization failed.", exception, false);
		}
	}
}
