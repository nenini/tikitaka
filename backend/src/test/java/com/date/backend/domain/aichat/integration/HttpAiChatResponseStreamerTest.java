package com.date.backend.domain.aichat.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpAiChatResponseStreamerTest {
	private final ObjectMapper objectMapper = new ObjectMapper();
	private HttpServer server;
	private String baseUrl;

	@BeforeEach
	void setUp() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.start();
		baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
	}

	@AfterEach
	void tearDown() {
		server.stop(0);
	}

	@Test
	void postRequestReadsSseChunksInOrder() throws Exception {
		AtomicReference<JsonNode> requestBody = new AtomicReference<>();
		AtomicReference<String> internalToken = new AtomicReference<>();
		server.createContext("/chat/stream", exchange -> {
			requestBody.set(objectMapper.readTree(exchange.getRequestBody()));
			internalToken.set(exchange.getRequestHeaders().getFirst("X-Internal-Token"));
			String response = """
					event: message
					data: {"content":"안녕"}

					data: {"choices":[{"delta":{"content":"하세요"}}]}

					event: done
					data: {}

					""";
			writeResponse(exchange, 200, "text/event-stream; charset=UTF-8", response);
		});

		HttpAiChatResponseStreamer streamer = streamer("/chat/stream", "test-token");
		List<String> chunks = new ArrayList<>();
		streamer.stream(new AiChatResponseStreamRequest(3L, 7L, "인사해줘"), chunks::add);

		assertThat(chunks).containsExactly("안녕", "하세요");
		assertThat(requestBody.get().path("userId").asLong()).isEqualTo(3L);
		assertThat(requestBody.get().path("sessionId").asLong()).isEqualTo(7L);
		assertThat(requestBody.get().path("messageText").asText()).isEqualTo("인사해줘");
		assertThat(internalToken.get()).isEqualTo("test-token");
	}

	@Test
	void ndjsonResponseIsStreamedLineByLine() throws Exception {
		server.createContext("/chat/stream", exchange -> {
			String response = """
					{"token":"첫"}
					{"delta":" 번째"}
					{"data":{"content":" 답변"}}
					""";
			writeResponse(exchange, 200, "application/x-ndjson", response);
		});

		List<String> chunks = new ArrayList<>();
		streamer("/chat/stream", "").stream(
				new AiChatResponseStreamRequest(1L, 2L, "질문"),
				chunks::add
		);

		assertThat(chunks).containsExactly("첫", " 번째", " 답변");
	}

	@Test
	void nonSuccessStatusRaisesAiServerException() {
		server.createContext("/chat/stream", exchange ->
				writeResponse(exchange, 503, "application/json", "{\"error\":\"unavailable\"}")
		);

		assertThatThrownBy(() -> streamer("/chat/stream", "").stream(
				new AiChatResponseStreamRequest(1L, 2L, "질문"),
				chunk -> {
				}
		))
				.isInstanceOf(HttpAiChatResponseStreamer.AiChatServerException.class)
				.hasMessageContaining("status=503")
				.hasMessageContaining("unavailable");
	}

	private HttpAiChatResponseStreamer streamer(String path, String internalToken) {
		return new HttpAiChatResponseStreamer(
				new AiChatProperties(
						baseUrl,
						path,
						Duration.ofSeconds(1),
						Duration.ofSeconds(5),
						internalToken
				),
				objectMapper
		);
	}

	private void writeResponse(
			HttpExchange exchange,
			int status,
			String contentType,
			String body
	) throws IOException {
		byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().set("Content-Type", contentType);
		exchange.sendResponseHeaders(status, bytes.length);
		exchange.getResponseBody().write(bytes);
		exchange.close();
	}
}
