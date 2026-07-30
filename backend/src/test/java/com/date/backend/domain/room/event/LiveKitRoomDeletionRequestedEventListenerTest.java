package com.date.backend.domain.room.event;

import com.date.backend.domain.room.integration.LiveKitRoomManager;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class LiveKitRoomDeletionRequestedEventListenerTest {

	@Test
	void deletesRoomAfterSessionTransactionCommits() {
		LiveKitRoomManager roomManager = mock(LiveKitRoomManager.class);
		var listener = new LiveKitRoomDeletionRequestedEventListener(roomManager);

		listener.handle(
				new LiveKitRoomDeletionRequestedEvent(15L, "date-room-15")
		);

		verify(roomManager).deleteRoom("date-room-15");
	}

	@Test
	void cleanupFailureDoesNotChangeCommittedSessionResult() {
		LiveKitRoomManager roomManager = mock(LiveKitRoomManager.class);
		doThrow(new IllegalStateException("LiveKit unavailable"))
				.when(roomManager)
				.deleteRoom("date-room-15");
		var listener = new LiveKitRoomDeletionRequestedEventListener(roomManager);

		assertThatCode(() -> listener.handle(
				new LiveKitRoomDeletionRequestedEvent(15L, "date-room-15")
		)).doesNotThrowAnyException();
	}
}
