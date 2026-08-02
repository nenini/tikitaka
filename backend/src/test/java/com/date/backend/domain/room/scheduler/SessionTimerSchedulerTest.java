package com.date.backend.domain.room.scheduler;

import com.date.backend.domain.room.application.SessionTimerService;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SessionTimerSchedulerTest {

	@Test
	void delegatesTimerPublishingToService() {
		SessionTimerService service = mock(SessionTimerService.class);
		SessionTimerScheduler scheduler = new SessionTimerScheduler(service);

		scheduler.publishTimerEvents();

		verify(service).publishTimerEvents();
	}
}
