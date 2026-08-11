package com.date.backend.domain.aichat.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class HttpAiChatResponseStreamer implements AiChatResponseStreamer {
	private static final String DONE_MARKER = "[DONE]";

	private final AiChatProperties properties;
	private final ObjectMapper objectMapper;
	private final HttpClient httpClient;
	private final URI streamUri;

	public HttpAiChatResponseStreamer(
			AiChatProperties properties,
			ObjectMapper objectMapper
	) {
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder()
				.connectTimeout(properties.connectTimeout())
				.build();
		this.streamUri = buildStreamUri(properties.baseUrl(), properties.streamPath());
	}

	@Override
	public void stream(
			AiChatResponseStreamRequest request,
			AiChatResponseStreamListener listener
	) throws Exception {
		String requestBody = objectMapper.writeValueAsString(request);
		HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(streamUri)
				.timeout(properties.requestTimeout())
				.header("Accept", "text/event-stream, application/x-ndjson, application/json")
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8));
		if (!properties.internalToken().isBlank()) {
			requestBuilder.header("X-Internal-Token", properties.internalToken());
		}

		HttpResponse<InputStream> response = httpClient.send(
				requestBuilder.build(),
				HttpResponse.BodyHandlers.ofInputStream()
		);
		try (InputStream body = response.body()) {
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				throw new AiChatServerException(
						"AI 서버가 오류를 반환했습니다. status=" + response.statusCode()
								+ ", body=" + readErrorBody(body)
				);
			}
			String contentType = response.headers()
					.firstValue("Content-Type")
					.orElse("")
					.toLowerCase(Locale.ROOT);
			if (contentType.contains("text/event-stream")) {
				readSse(body, listener);
			} else {
				readLineStream(body, listener);
			}
		}
	}

	private void readSse(InputStream body, AiChatResponseStreamListener listener) throws IOException {
		try (BufferedReader reader = reader(body)) {
			String eventName = null;
			List<String> dataLines = new ArrayList<>();
			String line;
			while ((line = reader.readLine()) != null) {
				checkInterrupted();
				if (line.isBlank()) {
					boolean done = dispatchSseEvent(eventName, dataLines, listener);
					eventName = null;
					dataLines.clear();
					if (done) {
						return;
					}
					continue;
				}
				if (line.startsWith(":")) {
					continue;
				}
				if (line.startsWith("event:")) {
					eventName = line.substring("event:".length()).trim();
				} else if (line.startsWith("data:")) {
					dataLines.add(line.substring("data:".length()).stripLeading());
				}
			}
			dispatchSseEvent(eventName, dataLines, listener);
		}
	}

	private boolean dispatchSseEvent(
			String eventName,
			List<String> dataLines,
			AiChatResponseStreamListener listener
	) throws IOException {
		if ("error".equalsIgnoreCase(eventName)) {
			throw new AiChatServerException("AI 서버 스트림에서 error 이벤트를 반환했습니다.");
		}
		if ("done".equalsIgnoreCase(eventName)) {
			return true;
		}
		if (dataLines.isEmpty()) {
			return false;
		}
		String data = String.join("\n", dataLines);
		if (DONE_MARKER.equals(data.trim())) {
			return true;
		}
		if ("persona".equalsIgnoreCase(eventName)) {
			listener.onPersonaSelected(extractPersona(data));
			return false;
		}
		emitPayload(data, listener);
		return false;
	}

	private void readLineStream(InputStream body, AiChatResponseStreamListener listener) throws IOException {
		try (BufferedReader reader = reader(body)) {
			String line;
			while ((line = reader.readLine()) != null) {
				checkInterrupted();
				if (line.isBlank() || DONE_MARKER.equals(line.trim())) {
					continue;
				}
				emitPayload(line, listener);
			}
		}
	}

	private void emitPayload(String payload, AiChatResponseStreamListener listener) throws IOException {
		String chunk = extractChunk(payload);
		if (chunk != null && !chunk.isEmpty()) {
			listener.onChunk(chunk);
		}
	}

	private AiChatPersonaSelection extractPersona(String payload) throws IOException {
		JsonNode root = objectMapper.readTree(payload);
		String personaKey = firstText(root, "personaKey");
		if (personaKey == null || personaKey.isBlank()) {
			throw new AiChatServerException("AI 서버의 persona 이벤트에 personaKey가 없습니다.");
		}
		return new AiChatPersonaSelection(personaKey, firstText(root, "displayName"));
	}

	private String extractChunk(String payload) throws IOException {
		String trimmed = payload.trim();
		if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
			return payload;
		}
		JsonNode root = objectMapper.readTree(trimmed);
		String direct = firstText(root, "content", "text", "token");
		if (direct != null) {
			return direct;
		}
		JsonNode delta = root.path("delta");
		if (delta.isTextual()) {
			return delta.asText();
		}
		if (delta.isObject()) {
			String deltaContent = firstText(delta, "content", "text");
			if (deltaContent != null) {
				return deltaContent;
			}
		}
		JsonNode data = root.path("data");
		if (data.isTextual()) {
			return data.asText();
		}
		if (data.isObject()) {
			String dataContent = firstText(data, "content", "text", "token");
			if (dataContent != null) {
				return dataContent;
			}
		}
		JsonNode choiceDeltaContent = root.path("choices").path(0).path("delta").path("content");
		if (choiceDeltaContent.isTextual()) {
			return choiceDeltaContent.asText();
		}
		return null;
	}

	private String firstText(JsonNode node, String... fields) {
		for (String field : fields) {
			JsonNode value = node.path(field);
			if (value.isTextual()) {
				return value.asText();
			}
		}
		return null;
	}

	private BufferedReader reader(InputStream body) {
		return new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8));
	}

	private String readErrorBody(InputStream body) throws IOException {
		byte[] bytes = body.readNBytes(2048);
		return new String(bytes, StandardCharsets.UTF_8);
	}

	private void checkInterrupted() throws IOException {
		if (Thread.currentThread().isInterrupted()) {
			throw new IOException("AI 응답 스트림 작업이 취소되었습니다.");
		}
	}

	private URI buildStreamUri(String baseUrl, String streamPath) {
		String normalizedBase = baseUrl.endsWith("/")
				? baseUrl.substring(0, baseUrl.length() - 1)
				: baseUrl;
		String normalizedPath = streamPath.startsWith("/") ? streamPath : "/" + streamPath;
		return URI.create(normalizedBase + normalizedPath);
	}

	public static class AiChatServerException extends IOException {
		public AiChatServerException(String message) {
			super(message);
		}
	}
}
