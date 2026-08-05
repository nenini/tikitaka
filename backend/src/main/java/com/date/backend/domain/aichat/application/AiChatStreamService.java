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
import com.date.backend.domain.aichat.integration.AiChatProperties;
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

	private final AiChatContextService contextService;
	private final AiChatTurnService turnService;
	private final AiChatResponseStreamer responseStreamer;
	private final Executor streamExecutor;
	private final long sseTimeoutMillis;
	private final Map<Long, ActiveStream> activeStreams = new ConcurrentHashMap<>();

	public AiChatStreamService(
			AiChatContextService contextService,
			AiChatTurnService turnService,
			AiChatResponseStreamer responseStreamer,
			AiChatProperties properties,
			@Qualifier("aiChatStreamExecutor") Executor streamExecutor
	) {
		this.contextService = contextService;
		this.turnService = turnService;
		this.responseStreamer = responseStreamer;
		this.streamExecutor = streamExecutor;
		this.sseTimeoutMillis = properties.sseTimeout().toMillis();
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
		ActiveStream activeStream = activeStreams.get(sessionId);
		if (activeStream == null || !activeStream.beginTermination()) {
			throw new BusinessException(AiChatErrorCode.AI_RESPONSE_CANCEL_NOT_ALLOWED);
		}
		activeStreams.remove(sessionId, activeStream);
		try {
			turnService.cancel(userId, sessionId, activeStream.userMessageId());
		} finally {
			activeStream.cancelFuture();
			activeStream.completeEmitter();
		}
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
		SseEmitter emitter = new SseEmitter(sseTimeoutMillis);
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

		emitter.onCompletion(() -> disconnectStream(userId, sessionId, activeStream));
		emitter.onTimeout(() -> timeoutStream(userId, sessionId, activeStream));
		emitter.onError(exception -> disconnectStream(userId, sessionId, activeStream));

		FutureTask<Void> task = new FutureTask<>(() -> {
			processStream(activeStream, userId, sessionId, userMessage, aiRequest);
			return null;
		});
		activeStream.setFuture(task);
		try {
			streamExecutor.execute(task);
		} catch (RuntimeException exception) {
			if (activeStream.beginTermination()) {
				removeStream(sessionId, activeStream);
				activeStream.cancelFuture();
				turnService.fail(
						userId,
						sessionId,
						userMessage.messageId(),
						AiChatErrorCode.AI_CHAT_SERVER_BUSY.code()
				);
			}
			log.warn("AI chat stream executor rejected request. sessionId={}", sessionId, exception);
			throw new BusinessException(AiChatErrorCode.AI_CHAT_SERVER_BUSY);
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
							if (chunk == null || chunk.isEmpty() || activeStream.isTerminated()) {
								return;
							}
							long sequence = chunkSequence.incrementAndGet();
							completeResponse.append(chunk);
							send(activeStream, "chunk", new AiChatStreamChunkEvent(sequence, chunk));
						}
					}
			);
			if (activeStream.isTerminated()) {
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
			completeStream(sessionId, activeStream);
		} catch (StreamDisconnectedException exception) {
			disconnectStream(userId, sessionId, activeStream);
		} catch (Exception exception) {
			log.error("AI chat response stream failed. sessionId={}", sessionId, exception);
			failStream(userId, sessionId, activeStream);
		} finally {
			removeStream(sessionId, activeStream);
		}
	}

	private void send(ActiveStream activeStream, String eventName, Object data) {
		if (activeStream.isTerminated()) {
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

	private void failStream(Long userId, Long sessionId, ActiveStream activeStream) {
		if (!activeStream.beginTermination()) {
			return;
		}
		removeStream(sessionId, activeStream);
		try {
			turnService.fail(
					userId,
					sessionId,
					activeStream.userMessageId(),
					AiChatErrorCode.AI_RESPONSE_STREAM_FAILED.code()
			);
			AiChatErrorCode errorCode = AiChatErrorCode.AI_RESPONSE_STREAM_FAILED;
			activeStream.emitter().send(
					SseEmitter.event()
							.name("error")
							.data(new AiChatStreamErrorEvent(errorCode.code(), errorCode.message()))
			);
		} catch (IOException | IllegalStateException exception) {
			log.debug("Unable to send AI chat error event. sessionId={}", sessionId, exception);
		} finally {
			activeStream.cancelFuture();
			activeStream.completeEmitter();
		}
	}

	private void timeoutStream(Long userId, Long sessionId, ActiveStream activeStream) {
		if (!activeStream.beginTermination()) {
			return;
		}
		removeStream(sessionId, activeStream);
		activeStream.cancelFuture();
		try {
			turnService.cancelIfProcessing(userId, sessionId, activeStream.userMessageId());
		} finally {
			activeStream.completeEmitter();
		}
	}

	private void disconnectStream(Long userId, Long sessionId, ActiveStream activeStream) {
		if (!activeStream.beginTermination()) {
			removeStream(sessionId, activeStream);
			return;
		}
		removeStream(sessionId, activeStream);
		activeStream.cancelFuture();
		turnService.cancelIfProcessing(userId, sessionId, activeStream.userMessageId());
	}

	private void completeStream(Long sessionId, ActiveStream activeStream) {
		if (activeStream.beginTermination()) {
			removeStream(sessionId, activeStream);
			activeStream.completeEmitter();
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
		private final AtomicBoolean terminated = new AtomicBoolean();
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
			if (terminated.get()) {
				future.cancel(true);
			}
		}

		boolean isTerminated() {
			return terminated.get();
		}

		boolean beginTermination() {
			return terminated.compareAndSet(false, true);
		}

		void cancelFuture() {
			if (future != null) {
				future.cancel(true);
			}
		}

		void completeEmitter() {
			try {
				emitter.complete();
			} catch (IllegalStateException ignored) {
				// Servlet 컨테이너가 이미 비동기 요청을 닫은 경우 중복 완료를 무시한다.
			}
		}
	}

	private static final class StreamDisconnectedException extends RuntimeException {
	}
}
