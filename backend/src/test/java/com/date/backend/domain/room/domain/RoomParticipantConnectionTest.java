package com.date.backend.domain.room.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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

	@Test
	void heartbeatIsAcceptedOnlyFromCurrentSidAndClientInstance() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_current", CONNECTED_AT);
		participant.recordHeartbeat(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(5)
		);

		assertThat(participant.getClientInstanceId()).isEqualTo("client-a");
		assertThat(participant.getLastHeartbeatAt())
				.isEqualTo(CONNECTED_AT.plusSeconds(5));
		assertThatThrownBy(() -> participant.recordHeartbeat(
				"PA_current",
				"client-b",
				CONNECTED_AT.plusSeconds(10)
		)).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> participant.recordHeartbeat(
				"PA_old",
				"client-a",
				CONNECTED_AT.plusSeconds(10)
		)).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void reconnectingUsesFixedDeadlineAndCanRecover() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_current", CONNECTED_AT);
		participant.recordHeartbeat(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(5)
		);

		boolean started = participant.startReconnecting(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(10),
				CONNECTED_AT.plusSeconds(30)
		);
		boolean duplicate = participant.startReconnecting(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(15),
				CONNECTED_AT.plusSeconds(35)
		);
		boolean recovered = participant.recordReconnected(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(20)
		);

		assertThat(started).isTrue();
		assertThat(duplicate).isFalse();
		assertThat(recovered).isTrue();
		assertThat(participant.getConnectionStatus())
				.isEqualTo(SessionConnectionStatus.CONNECTED);
		assertThat(participant.getReconnectDeadlineAt()).isNull();
		assertThat(participant.getReconnectAttemptCount()).isEqualTo(1);
	}

	@Test
	void expiredRecoveryChangesParticipantToDisconnected() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_current", CONNECTED_AT);
		participant.startReconnecting(
				CONNECTED_AT.plusSeconds(10),
				CONNECTED_AT.plusSeconds(30)
		);

		assertThat(participant.failRecovery(
				CONNECTED_AT.plusSeconds(29)
		)).isFalse();
		assertThat(participant.failRecovery(
				CONNECTED_AT.plusSeconds(30)
		)).isTrue();
		assertThat(participant.getConnectionStatus())
				.isEqualTo(SessionConnectionStatus.DISCONNECTED);
		assertThat(participant.getRecoveryFailedAt())
				.isEqualTo(CONNECTED_AT.plusSeconds(30));
	}

	@Test
	void newLiveKitSidReleasesPreviousClientInstanceClaim() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_old", CONNECTED_AT);
		participant.recordHeartbeat(
				"PA_old",
				"client-old",
				CONNECTED_AT.plusSeconds(5)
		);

		participant.recordConnected(
				"user-101",
				"PA_new",
				CONNECTED_AT.plusSeconds(10)
		);

		assertThat(participant.getParticipantSid()).isEqualTo("PA_new");
		assertThat(participant.getClientInstanceId()).isNull();
	}

	@Test
	void connectedClientCanUpdateMediaAndNetworkState() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_current", CONNECTED_AT);
		participant.recordHeartbeat(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(1)
		);

		boolean mediaChanged = participant.updateMediaState(
				"PA_current",
				"client-a",
				true,
				false,
				CONNECTED_AT.plusSeconds(2)
		);
		boolean qualityChanged = participant.updateNetworkQuality(
				"PA_current",
				"client-a",
				SessionNetworkQuality.GOOD,
				CONNECTED_AT.plusSeconds(3)
		);

		assertThat(mediaChanged).isTrue();
		assertThat(qualityChanged).isTrue();
		assertThat(participant.isCameraEnabled()).isTrue();
		assertThat(participant.isMicrophoneEnabled()).isFalse();
		assertThat(participant.getNetworkQuality())
				.isEqualTo(SessionNetworkQuality.GOOD);
		assertThat(participant.getMediaStateUpdatedAt())
				.isEqualTo(CONNECTED_AT.plusSeconds(2));
	}

	@Test
	void duplicateRealtimeStateDoesNotProduceAChange() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_current", CONNECTED_AT);
		participant.recordHeartbeat(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(1)
		);

		assertThat(participant.updateMediaState(
				"PA_current",
				"client-a",
				false,
				false,
				CONNECTED_AT.plusSeconds(2)
		)).isFalse();
		assertThat(participant.updateNetworkQuality(
				"PA_current",
				"client-a",
				SessionNetworkQuality.UNKNOWN,
				CONNECTED_AT.plusSeconds(2)
		)).isFalse();
	}

	@Test
	void reconnectingMarksNetworkLostAndDisconnectResetsMedia() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_current", CONNECTED_AT);
		participant.recordHeartbeat(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(1)
		);
		participant.updateMediaState(
				"PA_current",
				"client-a",
				true,
				true,
				CONNECTED_AT.plusSeconds(2)
		);

		participant.startReconnecting(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(3),
				CONNECTED_AT.plusSeconds(23)
		);
		participant.failRecovery(CONNECTED_AT.plusSeconds(23));

		assertThat(participant.getNetworkQuality())
				.isEqualTo(SessionNetworkQuality.LOST);
		assertThat(participant.isCameraEnabled()).isFalse();
		assertThat(participant.isMicrophoneEnabled()).isFalse();
	}

	@Test
	void reconnectingClientCannotChangeMediaState() {
		RoomParticipant participant = participant();
		participant.recordConnected("user-101", "PA_current", CONNECTED_AT);
		participant.recordHeartbeat(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(1)
		);
		participant.startReconnecting(
				"PA_current",
				"client-a",
				CONNECTED_AT.plusSeconds(2),
				CONNECTED_AT.plusSeconds(22)
		);

		assertThatThrownBy(() -> participant.updateMediaState(
				"PA_current",
				"client-a",
				true,
				true,
				CONNECTED_AT.plusSeconds(3)
		)).isInstanceOf(IllegalStateException.class);
	}

	private RoomParticipant participant() {
		return new RoomParticipant(mock(WaitingRoom.class), 101L, "A");
	}
}
