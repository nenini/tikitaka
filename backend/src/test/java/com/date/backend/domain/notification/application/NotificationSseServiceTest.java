package com.date.backend.domain.notification.application;

import com.date.backend.domain.notification.config.NotificationSseProperties;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import com.date.backend.domain.notification.dto.response.NotificationResponse;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationSseServiceTest {

	private static final Long USER_ID = 10L;

	private final NotificationSseEmitterFactory emitterFactory =
			mock(NotificationSseEmitterFactory.class);
	private final NotificationSseProperties properties =
			new NotificationSseProperties(1_800_000, 3_000);

	@Test
	void sendsNotificationToEveryConnectionOfUser() throws Exception {
		SseEmitter first = mock(SseEmitter.class);
		SseEmitter second = mock(SseEmitter.class);
		when(emitterFactory.create(properties.timeoutMs()))
				.thenReturn(first, second);
		NotificationSseService service = service();

		service.subscribe(USER_ID);
		service.subscribe(USER_ID);
		service.sendNotification(USER_ID, notification());

		verify(first, times(2)).send(any(SseEmitter.SseEventBuilder.class));
		verify(second, times(2)).send(any(SseEmitter.SseEventBuilder.class));
	}

	@Test
	void completionRemovesConnection() throws Exception {
		SseEmitter emitter = mock(SseEmitter.class);
		when(emitterFactory.create(properties.timeoutMs())).thenReturn(emitter);
		NotificationSseService service = service();
		ArgumentCaptor<Runnable> completionCaptor =
				ArgumentCaptor.forClass(Runnable.class);

		service.subscribe(USER_ID);
		verify(emitter).onCompletion(completionCaptor.capture());
		completionCaptor.getValue().run();
		service.sendNotification(USER_ID, notification());

		verify(emitter, times(1)).send(
				any(SseEmitter.SseEventBuilder.class)
		);
	}

	private NotificationSseService service() {
		return new NotificationSseService(
				emitterFactory,
				properties,
				Clock.fixed(
						Instant.parse("2026-07-28T04:00:00Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	private NotificationResponse notification() {
		return new NotificationResponse(
				100L,
				NotificationType.MATCH_FOUND,
				"새로운 매칭",
				"새로운 매칭이 성립되었습니다.",
				NotificationReferenceType.MATCH_PAIR,
				20L,
				NotificationPresentation.BELL_AND_TOAST,
				false,
				LocalDateTime.of(2026, 7, 28, 13, 0),
				null
		);
	}
}
