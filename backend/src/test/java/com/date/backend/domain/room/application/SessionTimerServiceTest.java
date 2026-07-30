package com.date.backend.domain.room.application;

import com.date.backend.domain.room.config.SessionTimerProperties;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionTimerEventType;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.event.SessionTimerBroadcastEvent;
import com.date.backend.domain.room.event.SessionTimerElapsedEvent;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Pageable;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionTimerServiceTest {
	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 29, 22, 0);

	private WaitingRoomRepository sessionRepository;
	private ApplicationEventPublisher eventPublisher;
	private WaitingRoom session;
	private SessionTimerService service;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		session = mock(WaitingRoom.class);
		when(session.getId()).thenReturn(15L);
		when(sessionRepository.findActiveTimersForUpdate(
				any(RoomSessionStatus.class),
				any(Pageable.class)
		)).thenReturn(List.of(session));
		service = new SessionTimerService(
				sessionRepository,
				new SessionTimerProperties(
						true,
						1_000,
						1_000,
						100,
						Duration.ofMinutes(5),
						Duration.ofMinutes(1)
				),
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-29T13:00:00Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void activeSessionPublishesTimerTick() {
		when(session.expectedEndAt()).thenReturn(NOW.plusMinutes(10));

		assertThat(service.publishTimerEvents()).isEqualTo(1);

		assertThat(broadcastTypes())
				.containsExactly(SessionTimerEventType.SESSION_TIMER_TICK);
		verify(session, never()).claimEndingSoonNotification(any());
	}

	@Test
	void fiveMinuteBoundaryPublishesEndingSoonOnce() {
		when(session.expectedEndAt()).thenReturn(NOW.plusMinutes(5));
		when(session.claimEndingSoonNotification(NOW)).thenReturn(true);

		service.publishTimerEvents();

		assertThat(broadcastTypes()).containsExactly(
				SessionTimerEventType.SESSION_TIMER_TICK,
				SessionTimerEventType.SESSION_ENDING_SOON
		);
	}

	@Test
	void oneMinuteBoundaryPublishesOnlyHighestMissedWarning() {
		when(session.expectedEndAt()).thenReturn(NOW.plusMinutes(1));
		when(session.claimEndingImminentNotification(NOW)).thenReturn(true);

		service.publishTimerEvents();

		assertThat(broadcastTypes()).containsExactly(
				SessionTimerEventType.SESSION_TIMER_TICK,
				SessionTimerEventType.SESSION_ENDING_IMMINENT
		);
		verify(session, never()).claimEndingSoonNotification(any());
	}

	@Test
	void expiredSessionPublishesExpirationAndLifecycleBoundary() {
		when(session.expectedEndAt()).thenReturn(NOW);
		when(session.claimTimerExpiredNotification(NOW)).thenReturn(true);

		service.publishTimerEvents();

		ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
		verify(eventPublisher, org.mockito.Mockito.times(2))
				.publishEvent(captor.capture());
		assertThat(captor.getAllValues())
				.anySatisfy(event -> assertThat(event)
						.isInstanceOf(SessionTimerBroadcastEvent.class))
				.anySatisfy(event -> assertThat(event)
						.isInstanceOf(SessionTimerElapsedEvent.class));
		SessionTimerBroadcastEvent broadcast = captor.getAllValues().stream()
				.filter(SessionTimerBroadcastEvent.class::isInstance)
				.map(SessionTimerBroadcastEvent.class::cast)
				.findFirst()
				.orElseThrow();
		assertThat(broadcast.payload().eventType())
				.isEqualTo(SessionTimerEventType.SESSION_TIME_EXPIRED);
		assertThat(broadcast.payload().remainingSeconds()).isZero();
	}

	private List<SessionTimerEventType> broadcastTypes() {
		ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
		verify(eventPublisher, org.mockito.Mockito.atLeastOnce())
				.publishEvent(captor.capture());
		return captor.getAllValues().stream()
				.filter(SessionTimerBroadcastEvent.class::isInstance)
				.map(SessionTimerBroadcastEvent.class::cast)
				.map(event -> event.payload().eventType())
				.toList();
	}
}
