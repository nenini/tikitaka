package com.date.backend.domain.aichat.application;

import com.date.backend.domain.aichat.dto.response.AiChatMessageResponse;
import com.date.backend.domain.aichat.dto.response.AiChatCancelResponse;
import com.date.backend.domain.aichat.dto.response.AiChatPersonaSelectedEvent;
import com.date.backend.domain.aichat.dto.response.AiChatStreamChunkEvent;
import com.date.backend.domain.aichat.dto.response.AiChatStreamConnectedEvent;
import com.date.backend.domain.aichat.dto.response.AiChatStreamDoneEvent;
import com.date.backend.domain.aichat.dto.response.AiChatStreamErrorEvent;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamRequest;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamListener;
import com.date.backend.domain.aichat.integration.AiChatResponseStreamer;
import com.date.backend.domain.aichat.integration.AiChatPersonaSelection;
import com.date.backend.domain.aichat.domain.AiResponseState;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AiChatErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
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

	private final AiChatContextService contextService;
	private final AiChatTurnService turnService;
	private final AiChatResponseStreamer responseStreamer;
	private final Executor streamExecutor;
	private final Map<Long, ActiveStream> activeStreams = new ConcurrentHashMap<>();

	public AiChatStreamService(
			AiChatContextService contextService,
			AiChatTurnService turnService,
			AiChatResponseStreamer responseStreamer,
			@Qualifier("aiChatStreamExecutor") Executor streamExecutor
	) {
		this.contextService = contextService;
		this.turnService = turnService;
		this.responseStreamer = responseStreamer;
		this.streamExecutor = streamExecutor;
	}

	public SseEmitter stream(Long userId, Long sessionId, String userMessageText) {
		contextService.validateContext(userId, sessionId);
		AiChatMessageResponse userMessage = turnService.startNewTurn(userId, sessionId, userMessageText);
		return startStream(userId, sessionId, userMessage);
	}

	public SseEmitter retry(Long userId, Long sessionId, Long userMessageId) {
		contextService.validateContext(userId, sessionId);
		AiChatMessageResponse userMessage = turnService.startRetry(userId, sessionId, userMessageId);
		return startStream(userId, sessionId, userMessage);
	}

	public AiChatCancelResponse cancel(
			Long userId,
			Long sessionId
	) {
		contextService.validateContext(userId, sessionId);
		ActiveStream activeStream = activeStreams.remove(sessionId);
		if (activeStream == null) {
			throw new BusinessException(AiChatErrorCode.AI_RESPONSE_CANCEL_NOT_ALLOWED);
		}
		turnService.cancel(userId, sessionId, activeStream.userMessageId());
		activeStream.cancelAndComplete();
		return new AiChatCancelResponse(
				sessionId,
				activeStream.userMessageId(),
				AiResponseState.CANCELLED
		);
	}

	private SseEmitter startStream(
			Long userId,
			Long sessionId,
			AiChatMessageResponse userMessage
	) {
		AiChatResponseStreamRequest aiRequest = contextService.createRequest(userId, sessionId);
		SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MILLIS);
		ActiveStream activeStream = new ActiveStream(emitter, userMessage.messageId());
		if (activeStreams.putIfAbsent(sessionId, activeStream) != null) {
			turnService.fail(
					userId,
					sessionId,
					userMessage.messageId(),
					AiChatErrorCode.AI_RESPONSE_ALREADY_IN_PROGRESS.code()
			);
			throw new BusinessException(AiChatErrorCode.AI_RESPONSE_ALREADY_IN_PROGRESS);
		}

		emitter.onCompletion(() -> removeStream(sessionId, activeStream));
		emitter.onTimeout(() -> cancelStream(userId, sessionId, activeStream));
		emitter.onError(exception -> cancelStream(userId, sessionId, activeStream));

		FutureTask<Void> task = new FutureTask<>(() -> {
			processStream(activeStream, userId, sessionId, userMessage, aiRequest);
			return null;
		});
		activeStream.setFuture(task);
		try {
			streamExecutor.execute(task);
		} catch (RuntimeException exception) {
			removeStream(sessionId, activeStream);
			turnService.fail(
					userId,
					sessionId,
					userMessage.messageId(),
					AiChatErrorCode.AI_RESPONSE_STREAM_FAILED.code()
			);
			throw exception;
		}
		return emitter;
	}

	private void processStream(
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
					turnService.complete(
							userId,
							sessionId,
							userMessage.messageId(),
							completeResponse.toString()
					);
			send(activeStream, "done", new AiChatStreamDoneEvent(
					sessionId,
					aiMessage.messageId(),
					aiMessage.sequenceNo(),
					personaKey.get()
			));
			activeStream.emitter().complete();
		} catch (StreamDisconnectedException exception) {
			activeStream.cancel();
			turnService.cancelIfProcessing(userId, sessionId, userMessage.messageId());
		} catch (Exception exception) {
			log.error("AI chat response stream failed. sessionId={}", sessionId, exception);
			turnService.fail(
					userId,
					sessionId,
					userMessage.messageId(),
					AiChatErrorCode.AI_RESPONSE_STREAM_FAILED.code()
			);
			sendError(activeStream);
		} finally {
			removeStream(sessionId, activeStream);
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

	private void cancelStream(Long userId, Long sessionId, ActiveStream activeStream) {
		if (activeStreams.remove(sessionId, activeStream)) {
			activeStream.cancel();
			turnService.cancelIfProcessing(userId, sessionId, activeStream.userMessageId());
		}
	}

	private void removeStream(Long sessionId, ActiveStream activeStream) {
		activeStreams.remove(sessionId, activeStream);
	}

	int activeStreamCount() {
		return activeStreams.size();
	}

	private static final class ActiveStream {
		private final SseEmitter emitter;
		private final Long userMessageId;
		private final AtomicBoolean cancelled = new AtomicBoolean();
		private volatile Future<?> future;

		private ActiveStream(SseEmitter emitter, Long userMessageId) {
			this.emitter = emitter;
			this.userMessageId = userMessageId;
		}

		SseEmitter emitter() {
			return emitter;
		}

		Long userMessageId() {
			return userMessageId;
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

		void cancelAndComplete() {
			cancel();
			emitter.complete();
		}
	}

	private static final class StreamDisconnectedException extends RuntimeException {
	}
}
