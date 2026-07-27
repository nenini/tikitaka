package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.dto.response.AiChatMessageResponse;
import com.date.backend.domain.aichat.dto.response.AiChatPersonaSelectedEvent;
import com.date.backend.domain.aichat.dto.response.AiChatStreamChunkEvent;
import com.date.backend.domain.aichat.dto.response.AiChatStreamConnectedEvent;
import com.date.backend.domain.aichat.dto.response.AiChatStreamDoneEvent;
import com.date.backend.domain.aichat.dto.response.AiChatStreamErrorEvent;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamRequest;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamListener;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamer;
import com.date.backend.domain.aichat.integration.AiChatPersonaSelection;
import com.date.backend.global.exception.code.AiChatErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class AiChatStreamService {
	private static final Logger log = LoggerFactory.getLogger(AiChatStreamService.class);
	private static final long SSE_TIMEOUT_MILLIS = 60_000L;

	private final AiChatMessageService messageService;
	private final AiChatContextService contextService;
	private final AiChatResponseStreamer responseStreamer;
	private final Executor streamExecutor;
	private final Map<String, ActiveStream> activeStreams = new ConcurrentHashMap<>();

	public AiChatStreamService(
			AiChatMessageService messageService,
			AiChatContextService contextService,
			AiChatResponseStreamer responseStreamer,
			@Qualifier("aiChatStreamExecutor") Executor streamExecutor
	) {
		this.messageService = messageService;
		this.contextService = contextService;
		this.responseStreamer = responseStreamer;
		this.streamExecutor = streamExecutor;
	}

	public SseEmitter stream(Long userId, Long sessionId, String userMessageText) {
		contextService.validateContext(userId, sessionId);
		AiChatMessageResponse userMessage =
				messageService.saveUserMessage(userId, sessionId, userMessageText);
		AiChatResponseStreamRequest aiRequest = contextService.createRequest(userId, sessionId);
		SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MILLIS);
		String streamId = UUID.randomUUID().toString();
		ActiveStream activeStream = new ActiveStream(emitter);
		activeStreams.put(streamId, activeStream);

		emitter.onCompletion(() -> removeStream(streamId));
		emitter.onTimeout(() -> cancelStream(streamId));
		emitter.onError(exception -> cancelStream(streamId));

		FutureTask<Void> task = new FutureTask<>(() -> {
			processStream(streamId, activeStream, userId, sessionId, userMessage, aiRequest);
			return null;
		});
		activeStream.setFuture(task);
		streamExecutor.execute(task);
		return emitter;
	}

	private void processStream(
			String streamId,
			ActiveStream activeStream,
			Long userId,
			Long sessionId,
			AiChatMessageResponse userMessage,
			AiChatResponseStreamRequest aiRequest
	) {
		StringBuilder completeResponse = new StringBuilder();
		AtomicLong chunkSequence = new AtomicLong();
		AtomicReference<String> personaKey = new AtomicReference<>(aiRequest.selectedPersonaKey());
		try {
			send(activeStream, "connected", new AiChatStreamConnectedEvent(sessionId, userMessage.messageId()));
			responseStreamer.stream(
					aiRequest,
					new AiChatResponseStreamListener() {
						@Override
						public void onPersonaSelected(AiChatPersonaSelection persona) {
							contextService.saveSelectedPersona(userId, sessionId, persona.personaKey());
							personaKey.set(persona.personaKey());
							send(activeStream, "persona", new AiChatPersonaSelectedEvent(
									persona.personaKey(),
									persona.displayName()
							));
						}

						@Override
						public void onChunk(String chunk) {
							if (chunk == null || chunk.isEmpty() || activeStream.isCancelled()) {
								return;
							}
							long sequence = chunkSequence.incrementAndGet();
							completeResponse.append(chunk);
							send(activeStream, "chunk", new AiChatStreamChunkEvent(sequence, chunk));
						}
					}
			);
			if (activeStream.isCancelled()) {
				return;
			}
			if (personaKey.get() == null || personaKey.get().isBlank()) {
				throw new IllegalStateException("AI server did not select a persona.");
			}
			if (completeResponse.isEmpty()) {
				throw new IllegalStateException("AI 응답 스트림이 빈 응답으로 종료되었습니다.");
			}
			AiChatMessageResponse aiMessage =
					messageService.saveAiMessage(userId, sessionId, completeResponse.toString());
			send(activeStream, "done", new AiChatStreamDoneEvent(
					sessionId,
					aiMessage.messageId(),
					aiMessage.sequenceNo(),
					personaKey.get()
			));
			activeStream.emitter().complete();
		} catch (StreamDisconnectedException exception) {
			activeStream.cancel();
		} catch (Exception exception) {
			log.error("AI chat response stream failed. sessionId={}", sessionId, exception);
			sendError(activeStream);
		} finally {
			removeStream(streamId);
		}
	}

	private void send(ActiveStream activeStream, String eventName, Object data) {
		if (activeStream.isCancelled()) {
			throw new StreamDisconnectedException();
		}
		try {
			activeStream.emitter().send(
					SseEmitter.event()
							.name(eventName)
							.data(data)
			);
		} catch (IOException | IllegalStateException exception) {
			throw new StreamDisconnectedException();
		}
	}

	private void sendError(ActiveStream activeStream) {
		if (activeStream.isCancelled()) {
			return;
		}
		try {
			AiChatErrorCode errorCode = AiChatErrorCode.AI_RESPONSE_STREAM_FAILED;
			activeStream.emitter().send(
					SseEmitter.event()
							.name("error")
							.data(new AiChatStreamErrorEvent(errorCode.code(), errorCode.message()))
			);
			activeStream.emitter().complete();
		} catch (IOException | IllegalStateException exception) {
			activeStream.cancel();
		}
	}

	private void cancelStream(String streamId) {
		ActiveStream activeStream = activeStreams.remove(streamId);
		if (activeStream != null) {
			activeStream.cancel();
		}
	}

	private void removeStream(String streamId) {
		activeStreams.remove(streamId);
	}

	int activeStreamCount() {
		return activeStreams.size();
	}

	private static final class ActiveStream {
		private final SseEmitter emitter;
		private final AtomicBoolean cancelled = new AtomicBoolean();
		private volatile Future<?> future;

		private ActiveStream(SseEmitter emitter) {
			this.emitter = emitter;
		}

		SseEmitter emitter() {
			return emitter;
		}

		void setFuture(Future<?> future) {
			this.future = future;
			if (cancelled.get()) {
				future.cancel(true);
			}
		}

		boolean isCancelled() {
			return cancelled.get();
		}

		void cancel() {
			if (cancelled.compareAndSet(false, true) && future != null) {
				future.cancel(true);
			}
		}
	}

	private static final class StreamDisconnectedException extends RuntimeException {
	}
}
