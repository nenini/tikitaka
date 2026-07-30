package com.date.backend.domain.coach.integration;

import com.date.backend.domain.room.event.AiSessionEndedEvent;
import com.date.backend.domain.room.event.AiSessionStartedEvent;

public interface AiSessionEventClient {
	boolean configured();

	void send(AiSessionStartedEvent event);

	void send(AiSessionEndedEvent event);
}
