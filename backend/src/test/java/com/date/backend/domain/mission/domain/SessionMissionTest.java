package com.date.backend.domain.mission.domain;

import com.date.backend.domain.room.domain.WaitingRoom;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SessionMissionTest {
	private static final LocalDateTime ASSIGNED_AT =
			LocalDateTime.of(2026, 7, 30, 19, 0);

	@Test
	void progressChangesFromAssignedToInProgressAndCompleted() {
		SessionMission mission = mission(2);

		assertThat(mission.addProgress(1, ASSIGNED_AT.plusSeconds(1)))
				.isTrue();
		assertThat(mission.getStatus())
				.isEqualTo(SessionMissionStatus.IN_PROGRESS);
		assertThat(mission.getProgressValue()).isEqualTo(1);

		assertThat(mission.addProgress(2, ASSIGNED_AT.plusSeconds(2)))
				.isTrue();
		assertThat(mission.getStatus())
				.isEqualTo(SessionMissionStatus.COMPLETED);
		assertThat(mission.getProgressValue()).isEqualTo(2);
		assertThat(mission.getCompletedAt())
				.isEqualTo(ASSIGNED_AT.plusSeconds(2));
	}

	@Test
	void completedMissionIgnoresAdditionalProgress() {
		SessionMission mission = mission(1);
		mission.addProgress(1, ASSIGNED_AT.plusSeconds(1));

		assertThat(mission.addProgress(1, ASSIGNED_AT.plusSeconds(2)))
				.isFalse();
		assertThat(mission.getProgressValue()).isEqualTo(1);
		assertThat(mission.getCompletedAt())
				.isEqualTo(ASSIGNED_AT.plusSeconds(1));
	}

	@Test
	void nonPositiveProgressIsRejected() {
		SessionMission mission = mission(1);

		assertThatThrownBy(() -> mission.addProgress(0, ASSIGNED_AT))
				.isInstanceOf(IllegalArgumentException.class);
	}

	private SessionMission mission(int targetValue) {
		MissionCatalog catalog = mock(MissionCatalog.class);
		when(catalog.getTargetValue()).thenReturn(targetValue);
		return new SessionMission(
				mock(WaitingRoom.class),
				101L,
				catalog,
				ASSIGNED_AT
		);
	}
}
