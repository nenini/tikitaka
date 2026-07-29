package com.date.backend.domain.room.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class RoomParticipantConnectionTest {
	private static final LocalDateTime CONNECTED_AT =
			LocalDateTime.of(2026, 7, 29, 20, 0);

	@Test
	void newParticipantHasDeterministicIdentityAndDisconnectedState() {
		RoomParticipant participant = participant();

		assertThat(participant.getParticipantIdentity()).isEqualTo("user-101");
		assertThat(participant.getConnectionStatus())
				.isEqualTo(SessionConnectionStatus.DISCONNECTED);
		assertThat(participant.getParticipantSid()).isNull();
	}

	@Test
	void joinedAndLeftEventsUpdateActualLiveKitConnectionState() {
		RoomParticipant participant = participant();

		boolean connected = participant.recordConnected(
				"user-101",
				"PA_first",
				CONNECTED_AT
		);
		boolean disconnected = participant.recordDisconnected(
				"user-101",
				"PA_first",
				CONNECTED_AT.plusMinutes(1)
		);

		assertThat(connected).isTrue();
		assertThat(disconnected).isTrue();
		assertThat(participant.getConnectionStatus())
				.isEqualTo(SessionConnectionStatus.DISCONNECTED);
		assertThat(participant.getConnectedAt()).isEqualTo(CONNECTED_AT);
		assertThat(participant.getDisconnectedAt())
				.isEqualTo(CONNECTED_AT.plusMinutes(1));
	}

	@Test
	void lateLeftEventForOldSidDoesNotDisconnectNewConnection() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_old", CONNECTED_AT);
		participant.recordConnected(
				"user-101",
				"PA_new",
				CONNECTED_AT.plusSeconds(10)
		);

		boolean changed = participant.recordDisconnected(
				"user-101",
				"PA_old",
				CONNECTED_AT.plusSeconds(20)
		);

		assertThat(changed).isFalse();
		assertThat(participant.getConnectionStatus())
				.isEqualTo(SessionConnectionStatus.CONNECTED);
		assertThat(participant.getParticipantSid()).isEqualTo("PA_new");
	}

	@Test
	void olderEventDoesNotOverwriteLatestConnectionState() {
		RoomParticipant participant = participant();
		participant.recordConnected(
				"user-101",
				"PA_current",
				CONNECTED_AT.plusMinutes(1)
		);

		boolean changed = participant.recordConnectionAborted(
				"user-101",
				"PA_current",
				CONNECTED_AT
		);

		assertThat(changed).isFalse();
		assertThat(participant.getConnectionStatus())
				.isEqualTo(SessionConnectionStatus.CONNECTED);
		assertThat(participant.getLastConnectionEventAt())
				.isEqualTo(CONNECTED_AT.plusMinutes(1));
	}

	private RoomParticipant participant() {
		return new RoomParticipant(mock(WaitingRoom.class), 101L, "A");
	}
}
